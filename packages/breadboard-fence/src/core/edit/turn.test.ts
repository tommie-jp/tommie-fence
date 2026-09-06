import { describe, expect, test } from 'vitest';
import { applyEdits } from './shared.ts';
import { flipPart, turnPart } from './turn.ts';

const LED = `board: half
points:
  vin: a5
parts:
  R1: resistor a5 a10 330
  D1: led b12(A) b13(K) red
  Q1: transistor h9(B) h10(C) h11(E) 2SC1815
  SW1: button @ e5
`;

const after = (source: string, result: ReturnType<typeof turnPart>): string => {
  if (!result.ok) throw new Error(result.error.message);
  return applyEdits(source, result.value.edits);
};

describe('turnPart', () => {
  test('turns around the middle of the leads, the way KiCad turns around the selection', () => {
    // 先に書いた足を軸にしていたころは、回すと胴が大きく振られて「移動」に
    // 見えた (実機で指摘された)。KiCad の R も選んだものの中心を軸にする。
    // c5 → c10 の真ん中は c7。時計回りに 90 度で a7 と f7 (胴はその場に残る)。
    const mid = 'board: half\nparts:\n  R1: resistor c5 c10 330\n';

    expect(after(mid, turnPart(mid, 'R1', 1))).toContain('R1: resistor a7 f7 330');
  });

  test('turns the other way when asked', () => {
    const flat = 'board: half\nparts:\n  R1: resistor e5 e10 330\n';

    expect(after(flat, turnPart(flat, 'R1', -1))).toContain('R1: resistor g7 b7 330');
  });

  test('turns around a lead written by name, so the name never has to be rewritten', () => {
    // **名前で書かれた足を番地に直さない。** 直すと名前が外れ、あとで点を
    // 動かしても部品が付いてこなくなる。名前は場所を指す約束なので、
    // そこを軸にすれば書き換えずに済む (真ん中を軸にする規則より優先する)。
    const named = 'board: half\npoints:\n  vin: c5\nparts:\n  R1: resistor vin c10 330\n';

    expect(after(named, turnPart(named, 'R1', 1))).toContain('R1: resistor vin h5 330');
  });

  test('does nothing for a full turn, rather than writing the same text back', () => {
    const result = turnPart(LED, 'R1', 4);

    expect(result.ok && result.value.edits).toEqual([]);
  });

  test('slides a turn that would walk off the board back onto it', () => {
    // **縁に置いた部品も回せる。** a5 → a10 を回すと足が板の上へ出るが、
    // 断ると「この部品は回らない」に見える (実機で「capacitor, inductor など
    // ほとんど回転できない」と言われたのがこれ)。足りない分だけ下へ寄せる。
    const top = 'board: half\nparts:\n  R1: resistor a5 a10 330\n';

    expect(after(top, turnPart(top, 'R1', 1))).toContain('R1: resistor a7 f7 330');
    expect(after(top, turnPart(top, 'R1', -1))).toContain('R1: resistor f7 a7 330');
  });

  test('slides the narrower parts too, which is why they looked unturnable', () => {
    // 足の間隔が狭いほど寄せる量は小さい。回れるかどうかは**部品の種類ではなく
    // 置いた行**で決まっていた。
    const top = 'board: half\nparts:\n  C1: capacitor a5 a8 0.1u\n';

    expect(after(top, turnPart(top, 'C1', 1))).toContain('C1: capacitor a6 d6 0.1u');
  });

  test('slides sideways as well, when the turn runs past the last column', () => {
    // 縦向きの部品を横にすると、右の縁からはみ出すことがある。
    const edge = 'board: half\nparts:\n  R1: resistor a29 f29 330\n';

    expect(after(edge, turnPart(edge, 'R1', 1))).toContain('R1: resistor c30 c25 330');
  });

  test('refuses only when the part cannot fit on the board at all', () => {
    // 12 列にまたがる部品を縦にすると 12 行要る。板は 10 行しかないので、
    // どこへ寄せても載らない。**そのときだけ**断る。
    const wide = 'board: half\nparts:\n  R1: resistor a1 a13 330\n';
    const result = turnPart(wide, 'R1', 1);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message).toContain('収まりません');
  });

  test('does not slide while placing, so the leg lands in the hole that was pressed', () => {
    // 置く前の回しは押した穴が軸。寄せると「押した穴に置けない」ことになるので、
    // 入らないときは断って、ゴーストを赤で見せる側に任せる。
    const low = 'board: half\nparts:\n  R1: resistor h5 h10 330\n';
    const result = turnPart(low, 'R1', 1, 'anchor');

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message).toContain('板の外');
  });

  test('turns a part that sits on a rail, counting the rails as rows of their own', () => {
    // レールは行が極性そのものなので数えていなかったが、そのせいで
    // **レールに挿した部品だけ回せなかった** (実機の例に 1 件あった)。
    // 上から `+t` `-t` a〜j `-b` `+b` と並べれば、穴と同じ勘定で回る。
    // レールから穴へ渡した部品 (例 08 の `Re`)。回すと穴の中で横になる。
    const rail = 'board: half\nparts:\n  R1: resistor -t20 e20 330\n';

    expect(after(rail, turnPart(rail, 'R1', 1))).toContain('R1: resistor b22 b17 330');
  });

  test('refuses a turn that would put both legs on one rail, which is a short', () => {
    // その行は丸ごと 1 本の電位。置くときと同じ見方で断る。
    const rail = 'board: half\nparts:\n  R1: resistor +t5 -t5 330\n';
    const result = turnPart(rail, 'R1', 1);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message).toContain('短絡');
  });

  test('does not move a part into a rail it was not already in', () => {
    // 黙って電源につながると回路の意味が変わる (つなぐのは配線の仕事)。
    const low = 'board: half\nparts:\n  Q1: transistor i5 i6 i7\n';
    const result = turnPart(low, 'Q1', 1, 'anchor');

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message).toContain('レールに入ります');
  });

  test('turns a three lead part too, since its holes are all written', () => {
    // h9 h10 h11 は横並び。真ん中は h10。時計回りに 90 度で縦並びになる。
    expect(after(LED, turnPart(LED, 'Q1', 1))).toContain('Q1: transistor g10(B) h10(C) i10(E) 2SC1815');
  });

  test('says a tact switch is symmetric, rather than that it has no direction', () => {
    // 回しても同じ穴どうしがつながる。**直しようのない断りに読ませない。**
    const result = turnPart(LED, 'SW1', 1);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message).toContain('対称');
  });
});

describe('flipPart', () => {
  test('swaps the two leads, which is what a flip is', () => {
    expect(after(LED, flipPart(LED, 'R1'))).toContain('R1: resistor a10 a5 330');
  });

  test('leaves the polarity tags where they are, so the cathode moves to the other hole', () => {
    // **印を一緒に動かすと何も変わらない。** `b13(K) b12(A)` は書き方が違うだけで
    // 「K は b13」のまま — 押しても図が変わらない (実機で「varicap が反転できない」)。
    // 番地だけを入れ替えれば、カソードが反対の穴へ移る = 実物を裏返したのと同じ。
    expect(after(LED, flipPart(LED, 'D1'))).toContain('D1: led b13(A) b12(K) red');
  });

  test('keeps a name written by points:, instead of spelling out the address', () => {
    const named = LED.replace('resistor a5 a10', 'resistor vin a10');

    expect(after(named, flipPart(named, 'R1'))).toContain('R1: resistor a10 vin 330');
  });

  test('says the polarity changed, since a different lead now sits in each hole', () => {
    // 穴どうしのつながりは同じだが、**どちらの足がどちらの穴か**は入れ替わる。
    // 極性のある部品ではそこが意味を持つので、黙らせない。
    const result = flipPart(LED, 'R1');

    expect(result.ok && result.value.diff.lost.length).toBeGreaterThan(0);
  });

  test('reverses the leads of a three lead part, leaving the middle in place', () => {
    // 実物を裏返したときと同じ — 両端が入れ替わり、真ん中はその場に残る。
    // 印は動かないので、**B が h11 へ、E が h9 へ**移る (足の並びが本当に変わる)。
    expect(after(LED, flipPart(LED, 'Q1'))).toContain('Q1: transistor h11(B) h10(C) h9(E) 2SC1815');
  });

  test('says why a part placed by one anchor cannot be flipped', () => {
    expect(!flipPart(LED, 'SW1').ok).toBe(true);
  });
});

describe('アンカー 1 つで置く形 (DIP / SIP / ボード)', () => {
  // 足の位置を形が決めるので穴の順に向きが出ない。**回すのは語、裏返すのは行。**
  const DIP = 'board: half\nparts:\n  U1: dip8 @ e5 NJM4556A\n';

  test('writes the word instead of moving holes, since the hole is the anchor', () => {
    expect(after(DIP, turnPart(DIP, 'U1', 1))).toContain('U1: dip8 @ e5 r180 NJM4556A');
  });

  test('takes the word away on the second turn, leaving no gap behind it', () => {
    const turned = 'board: half\nparts:\n  U1: dip8 @ e5 r180 NJM4556A\n';

    expect(after(turned, turnPart(turned, 'U1', 1))).toContain('U1: dip8 @ e5 NJM4556A');
  });

  test('folds a quarter turn into a half, because a quarter cannot be built', () => {
    // 溝をまたぐ 2 列は 90 度回すと同じ列に重なる。**押して何も起きない道具に
    // しない**ので、掴んで R を押したら半周ぶん回す。
    const result = turnPart(DIP, 'U1', 2);

    expect(result.ok && result.value.edits).toEqual([]);
  });

  test('flips by moving the anchor across the ravine, not by writing mirror', () => {
    // 裏返した形は `@ f5` そのもの。語を足すと同じ置き方が 2 通りになる。
    expect(after(DIP, flipPart(DIP, 'U1'))).toContain('U1: dip8 @ f5 NJM4556A');
  });

  test('flips a board to the paired row on the other block', () => {
    const pico = 'board: full\nparts:\n  M1: pico @ h5\n';

    expect(after(pico, flipPart(pico, 'M1'))).toContain('M1: pico @ c5');
  });

  test('refuses to flip a single row part, which would land on the same holes', () => {
    const sip = 'board: half\nparts:\n  J1: sip4 @ a20\n';
    const result = flipPart(sip, 'J1');

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message).toContain('同じ順');
  });
});
