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
  test('swings the far lead a quarter turn around the anchor', () => {
    // b2 → b6 は右へ 4。時計回りに 90 度で下へ 4 (f2)。
    expect(after(BOARD, turnPart(BOARD, 'R1', 1))).toContain('R1: resistor b2 f2 10k');
  });

  test('turns the other way when asked', () => {
    const flat = 'board: 12x7\nparts:\n  R1: resistor e2 e6 10k\n';

    expect(after(flat, turnPart(flat, 'R1', -1))).toContain('R1: resistor e2 a2 10k');
  });

  test('leaves the anchor untouched, so turning never becomes moving', () => {
    // アンカーの綴りは 1 字も動かさない (動かすと「回す」が「移動」になる)。
    const after1 = after(BOARD, turnPart(BOARD, 'R1', 1));

    expect(after1).toContain('R1: resistor b2 ');
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
    // d2 d3 d4 は横並び。時計回りに 90 度で縦並びになる。
    expect(after(BOARD, turnPart(BOARD, 'Q1', 1))).toContain('Q1: transistor d2 e2 f2 2SC1815');
  });

  test('says why a part placed by one anchor cannot be turned', () => {
    // 足の位置を形が決めるので、穴の順に向きが出ない (向きの語で回す)。
    const dip = 'board: 12x7\nparts:\n  U1: dip8 c3 NE555\n';
    const result = turnPart(dip, 'U1', 1);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message).toContain('形が決める');
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
