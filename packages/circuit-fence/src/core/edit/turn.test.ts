import { describe, expect, test } from 'vitest';
import { flipPart, turnPart } from './turn.ts';
import { applyRewrite } from './shared.ts';

const RC = [
  'parts:',
  '  R1: resistor a1 a3 10k',
  '  C1: capacitor c3 c5',
  '  Q1: npn b5',
  '  G1: ground e3',
  'wires:',
  '  - a3 -- c3',
  '',
].join('\n');

/** 向きの語で回す種類を集めたもの (2 端子は番地の順で回るので別)。 */
const TURNABLE = [
  'parts:',
  '  Q1: npn b2 2SC1815',
  '  U1: opamp b5 +up',
  '  G1: ground b8',
  '  T1: transformer b11',
  '  U2: dip8 e2',
  '  VCC: vcc e5',
  '',
].join('\n');

const turned = (source: string, id: string, quarters: number) => {
  const result = turnPart(source, id, quarters);
  if (!result.ok) throw new Error(result.error.message);
  return { ...result.value, source: applyRewrite(source, result.value) };
};

describe('turnPart', () => {
  test('turns a two-terminal part clockwise about the end it is anchored by', () => {
    // a1 -> a3 は右向き。時計回りで下向き (a1 -> c1) になる。
    expect(turned(RC, 'R1', 1).source).toContain('  R1: resistor a1 c1 10k');
  });

  test('turns it the other way when asked', () => {
    expect(turned(RC, 'C1', -1).source).toContain('  C1: capacitor c3 a3');
  });

  test('comes back to where it started after four quarters', () => {
    // 端の周りを回るので、格子の縁に近い部品は途中で外へ出る (C1 は真ん中)。
    const once = turned(RC, 'C1', 1).source;
    const twice = turned(once, 'C1', 1).source;
    const thrice = turned(twice, 'C1', 1).source;

    expect(turned(thrice, 'C1', 1).source).toBe(RC);
  });

  test('leaves the value and everything else on the line alone', () => {
    expect(turned(RC, 'R1', 1).source).toContain('10k');
    expect(turned(RC, 'R1', 1).source).toContain('  Q1: npn b5');
  });

  test('says which connections the turn broke', () => {
    // a3 で配線とつながっていた端が離れる。
    expect(turned(RC, 'R1', 1).diff.lost.length).toBeGreaterThan(0);
  });

  test('refuses to turn a part off the grid, rather than clamping it', () => {
    const result = turnPart(RC, 'R1', -1);

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.message).toContain('格子の外');
  });

  test('writes the word on a multi-terminal part that had no orientation', () => {
    // 番地の順では回せないので、文法の語のほうを書く。型番はそのまま。
    expect(turned(TURNABLE, 'Q1', 1).source).toContain('  Q1: npn b2 r90 2SC1815');
  });

  test('advances the word that is already there', () => {
    const once = turned(TURNABLE, 'Q1', 1).source;

    expect(turned(once, 'Q1', 1).source).toContain('  Q1: npn b2 r180 2SC1815');
  });

  test('takes the word away again when the symbol comes back upright', () => {
    const thrice = turned(turned(turned(TURNABLE, 'Q1', 1).source, 'Q1', 1).source, 'Q1', 1).source;

    expect(turned(thrice, 'Q1', 1).source).toBe(TURNABLE);
  });

  test('turns a multi-terminal part the other way', () => {
    expect(turned(TURNABLE, 'Q1', -1).source).toContain('  Q1: npn b2 r270 2SC1815');
  });

  test('leaves the sign word alone, which is a different key', () => {
    expect(turned(TURNABLE, 'U1', 1).source).toContain('  U1: opamp b5 r90 +up');
  });

  test('turns ground, the one one-terminal symbol that can be turned', () => {
    expect(turned(TURNABLE, 'G1', 1).source).toContain('  G1: ground b8 r90');
  });

  test('refuses a symbol the table says cannot be turned', () => {
    // トランスは回すと巻線と鉄心がばらける (反転はできる)。
    const result = turnPart(TURNABLE, 'T1', 1);

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.message).toContain('transformer');
  });

  test('refuses a power rail, whose up and down are its meaning', () => {
    expect(turnPart(TURNABLE, 'VCC', 1).ok).toBe(false);
  });

  test('does nothing for a whole circle, so no step is stacked', () => {
    const result = turnPart(TURNABLE, 'Q1', 4);

    expect(result.ok && result.value.edits).toEqual([]);
  });

  test('says so when there is no such part', () => {
    expect(turnPart(RC, 'R9', 1).ok).toBe(false);
  });

  test('refuses a fence it cannot read', () => {
    expect(turnPart('parts:\n  R1: [unclosed\n', 'R1', 1).ok).toBe(false);
  });
});

describe('flipPart', () => {
  const flipped = (source: string, id: string) => {
    const result = flipPart(source, id);
    if (!result.ok) throw new Error(result.error.message);
    return { ...result.value, source: applyRewrite(source, result.value) };
  };

  test('swaps the two ends, which is what polarity is written as', () => {
    expect(flipped(RC, 'R1').source).toContain('  R1: resistor a3 a1 10k');
  });

  test('joins the same two cells, and only says which end is which changed', () => {
    // 極性のある部品 (ダイオード・電解コンデンサ) では、これが反転の意味そのもの。
    const { diff } = flipped(RC, 'R1');

    expect(diff.lost).toEqual([['C1.1', 'R1.2']]);
    expect(diff.gained).toEqual([['C1.1', 'R1.1']]);
  });

  test('comes back after two flips', () => {
    expect(flipped(flipped(RC, 'R1').source, 'R1').source).toBe(RC);
  });

  test('writes mirror on a multi-terminal part, keeping the model number', () => {
    expect(flipped(TURNABLE, 'Q1').source).toContain('  Q1: npn b2 mirror 2SC1815');
  });

  test('takes mirror away again on the second flip', () => {
    expect(flipped(flipped(TURNABLE, 'Q1').source, 'Q1').source).toBe(TURNABLE);
  });

  test('refuses to mirror a DIP, whose pin numbers would read backwards', () => {
    const result = flipPart(TURNABLE, 'U2');

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.message).toContain('dip8');
  });

  test('refuses to mirror ground, which is symmetric and would not change', () => {
    expect(flipPart(TURNABLE, 'G1').ok).toBe(false);
  });
});

describe('名前で書かれた端 (レビューで出た穴)', () => {
  const named = [
    'points:',
    '  vin: a1',
    '  vout: a3',
    'parts:',
    '  R1: resistor vin vout 10k',
  ].join('\n');

  test('flips by swapping the spellings, so the names survive', () => {
    // 番地に書き換えると points: の名前が外れ、あとで点を動かしても部品が付いてこない。
    // ネットの差分は空なので、何も言わずに切れる。
    const result = flipPart(named, 'R1');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(applyRewrite(named, result.value)).toContain('R1: resistor vout vin 10k');
  });

  test('turns without touching the anchor, which does not move', () => {
    const result = turnPart(named, 'R1', 1);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const written = applyRewrite(named, result.value);

    expect(written).toContain('R1: resistor vin ');
    expect(written).not.toContain('resistor a1 ');
  });

  test('does nothing at all when asked to turn by a whole circle', () => {
    // 同じ字を書き戻す編集を返すと、呼ぶ側の「何も変わっていない」判定を素通りして、
    // 書類が汚れ・元に戻す段が積まれ・「動かしました」と言われる。
    const result = turnPart(named, 'R1', 0);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.edits).toEqual([]);
  });
});
