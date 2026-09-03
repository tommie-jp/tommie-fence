import { describe, expect, test } from 'vitest';
import { applyEdits } from './shared.ts';
import { flipPart, turnPart } from './turn.ts';

const BOARD = `board: 12x7
points:
  IN: b2
parts:
  R1: resistor b2 b6 10k
  Q1: transistor d2 d3 d4 2SC1815
`;

const after = (source: string, result: ReturnType<typeof turnPart>): string => {
  if (!result.ok) throw new Error(result.error.message);
  return applyEdits(source, result.value.edits);
};

describe('turnPart', () => {
  test('turns around the middle of the leads, the way KiCad turns around the selection', () => {
    // 先に書いた足を軸にしていたころは、回すと胴が大きく振られて「移動」に
    // 見えた (実機で指摘された)。KiCad の R も選んだものの中心を軸にする。
    // e2 → e6 の真ん中は e4。時計回りに 90 度で g4 と c4 (胴はその場に残る)。
    const flat = 'board: 12x9\nparts:\n  R1: resistor e2 e6 10k\n';

    expect(after(flat, turnPart(flat, 'R1', 1))).toContain('R1: resistor c4 g4 10k');
  });

  test('gives a three-lead part four different postures, so the flat face can face any way', () => {
    // **回すたびにパッケージの向きが変わること。** 足の並びの傾きだけを見て
    // 描いていたころは、180 度回しても TO-92 の平らな面が上を向いたままだった
    // (実機で「回すを押しても切り込み面を下にできない」と言われた)。
    // 板の真ん中に置く (縁だと回した先が板の外になる)。
    const room = 'board: 12x9\nparts:\n  Q1: transistor e5 e4 e6 2SC1815\n';
    const seen = new Set<string>();
    let now = room;
    for (let quarter = 0; quarter < 4; quarter += 1) {
      const line = /Q1: transistor [^\n]+/.exec(now)?.[0] ?? '';
      seen.add(line);
      now = after(now, turnPart(now, 'Q1', 1));
    }

    expect(seen.size).toBe(4);
    // 4 回で元に戻る。
    expect(now).toBe(room);
  });

  test('turns the other way when asked', () => {
    const flat = 'board: 12x9\nparts:\n  R1: resistor e2 e6 10k\n';

    expect(after(flat, turnPart(flat, 'R1', -1))).toContain('R1: resistor g4 c4 10k');
  });

  test('keeps the middle hole where it was, so turning never becomes moving', () => {
    // **軸は動かない。** 3 本足なら真ん中の足がその穴に残る。
    const flat = 'board: 12x9\nparts:\n  Q1: transistor e4 e3 e5 2SC1815\n';

    expect(after(flat, turnPart(flat, 'Q1', 1))).toContain('Q1: transistor e4 d4 f4 2SC1815');
  });

  test('does nothing for a full turn, rather than writing the same text back', () => {
    const result = turnPart(BOARD, 'R1', 4);

    expect(result.ok && result.value.edits).toEqual([]);
  });

  test('refuses a turn that would walk off the board, naming the hole', () => {
    // 上端の行から上へ回すと外れる。**どの穴が出るのかを名指す。**
    const top = 'board: 12x7\nparts:\n  R1: resistor a2 a6 10k\n';
    const result = turnPart(top, 'R1', -1);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message).toContain('板の外');
  });

  test('turns a three lead part too, since its holes are all written', () => {
    // d2 d3 d4 は横並び。真ん中は d3。時計回りに 90 度で縦並びになる。
    expect(after(BOARD, turnPart(BOARD, 'Q1', 1))).toContain('Q1: transistor c3 d3 e3 2SC1815');
  });

});

describe('アンカー 1 つで置く形 (DIP / SIP)', () => {
  // 足の位置を形が決めるので穴の順に向きが出ない。**語のほうを書き換える。**
  const DIP = 'board: 16x16\nparts:\n  U1: dip8 h8 NE555\n';

  test('writes the orientation word instead of moving holes, since the hole is the anchor', () => {
    expect(after(DIP, turnPart(DIP, 'U1', 1))).toContain('U1: dip8 h8 r90 NE555');
  });

  test('puts the word right after the hole, so the value stays last', () => {
    // `ID: 種類 穴 [向き] [値]` の並びを崩さない。
    expect(after(DIP, flipPart(DIP, 'U1'))).toContain('U1: dip8 h8 mirror NE555');
  });

  test('rewrites the word that is already there, rather than adding a second one', () => {
    const turned = 'board: 16x16\nparts:\n  U1: dip8 h8 r90 NE555\n';

    expect(after(turned, turnPart(turned, 'U1', 1))).toContain('U1: dip8 h8 r180 NE555');
  });

  test('takes the word away on the way back round, leaving no gap behind it', () => {
    // 0 度は語を書かない。**前の空白ごと消す** — 行末に余りを残さないため。
    const turned = 'board: 16x16\nparts:\n  U1: dip8 h8 r270\n';

    expect(after(turned, turnPart(turned, 'U1', 1))).toBe('board: 16x16\nparts:\n  U1: dip8 h8\n');
  });

  test('flips back by taking the mirror away', () => {
    const flipped = 'board: 16x16\nparts:\n  U1: dip8 h8 mirror NE555\n';

    expect(after(flipped, flipPart(flipped, 'U1'))).toContain('U1: dip8 h8 NE555');
  });

  test('keeps the rotation when flipping, changing only the one thing asked for', () => {
    // 足す語は**穴のすぐ後ろ**なので、既にある回転より前に来る。読む側は
    // 順を問わない (circuit-fence も同じ位置に足す — 3 つのフェンスで揃える)。
    const turned = 'board: 16x16\nparts:\n  U1: dip8 h8 r90 NE555\n';

    expect(after(turned, flipPart(turned, 'U1'))).toContain('U1: dip8 h8 mirror r90 NE555');
  });

  test('refuses a turn that walks the legs off the board, naming the hole', () => {
    // 回すと縁を踏みやすい。**帯だけ残して図が消える**より、ここで断るほうがよい。
    const edge = 'board: 16x16\nparts:\n  U1: dip8 a1\n';
    const result = turnPart(edge, 'U1', 1);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message).toContain('板の外');
  });
});

describe('flipPart', () => {
  test('swaps the two leads, which is what a flip is', () => {
    expect(after(BOARD, flipPart(BOARD, 'R1'))).toContain('R1: resistor b6 b2 10k');
  });

  test('swaps the spellings as written, not addresses it re-derived', () => {
    // **この文法では足に `points:` の名前を書けない** (名前が書けるのは配線の端)
    // ので、綴りはどれも番地。それでも「書かれた字を入れ替える」形は保つ —
    // 綴りを組み直すと、書き方の違い (前ゼロなど) が黙って揃えられる。
    const spaced = 'board: 12x7\nparts:\n  R1: resistor b2  b6 10k\n';

    expect(after(spaced, flipPart(spaced, 'R1'))).toContain('R1: resistor b6  b2 10k');
  });

  test('says the polarity changed, since a different lead now sits in each hole', () => {
    // 穴どうしのつながりは同じだが、**どちらの足がどちらの穴か**は入れ替わる。
    // 極性のある部品ではそこが意味を持つので、黙らせない。
    const result = flipPart(BOARD, 'R1');

    expect(result.ok && result.value.diff.lost.length).toBeGreaterThan(0);
  });

  test('reverses the leads of a three lead part, leaving the middle in place', () => {
    // 実物を裏返したときと同じ — 両端が入れ替わり、真ん中はその場に残る。
    expect(after(BOARD, flipPart(BOARD, 'Q1'))).toContain('Q1: transistor d4 d3 d2 2SC1815');
  });
});
