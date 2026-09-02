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

  test('refuses a one-terminal part, which needs a word in the grammar', () => {
    const result = turnPart(RC, 'G1', 1);

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.message).toContain('向き');
  });

  test('refuses a multi-terminal part for the same reason', () => {
    expect(turnPart(RC, 'Q1', 1).ok).toBe(false);
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

  test('refuses a multi-terminal part, which needs mirror in the grammar', () => {
    expect(flipPart(RC, 'Q1').ok).toBe(false);
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
