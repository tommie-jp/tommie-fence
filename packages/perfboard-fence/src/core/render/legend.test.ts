import { describe, expect, test } from 'vitest';
import { legendColors, paintedColors } from './legend.ts';

const wire = (color: string | null) => ({ color });
const part = (type: string, value: string | null) => ({ type, value });

describe('paintedColors', () => {
  test('gathers the three places a colour carries meaning', () => {
    const found = paintedColors({
      wires: [wire('red'), wire(null)],
      parts: [part('resistor', '10k'), part('led', 'GREEN')],
    });

    expect(found).toContain('red');
    // カラーコードの帯 (10k は茶黒橙 + 許容差)。
    expect(found).toContain('orange');
    // LED の色は書かれたまま来るので、引くときに小文字に畳む。
    expect(found).toContain('green');
  });

  test('leaves out parts that carry no colour of their own', () => {
    const found = paintedColors({ wires: [], parts: [part('capacitor', '10n')] });

    expect(found).toEqual([]);
  });

  test('says nothing for a resistor whose value cannot be read', () => {
    // 実物と違う帯を凡例に並べると、図を信じた人が違う抵抗を挿す。
    expect(paintedColors({ wires: [], parts: [part('resistor', 'ほどほど')] })).toEqual([]);
  });
});

describe('legendColors', () => {
  test('keeps the order they were written in, folding repeats', () => {
    expect(legendColors(['red', 'black', 'red', null, 'black'])).toEqual(['red', 'black']);
  });

  test('drops what has no weave of its own, rather than listing a blank', () => {
    expect(legendColors(['red', 'chartreuse'])).toEqual(['red']);
  });
});
