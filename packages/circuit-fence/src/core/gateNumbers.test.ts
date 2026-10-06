import { describe, expect, test } from 'vitest';
import { compileCircuit } from './index.ts';
import { gateNumbersOf } from './gateNumbers.ts';
import { buildCircuit } from './model/circuit.ts';
import { parseFence } from './parser/parseFence.ts';
import { generateTex } from './tex/generate.ts';
import type { PartSpec } from './types.ts';

/**
 * ゲートの記号に添える IC のピンの番号 (`U1A: nand c3 74HC00`)。**回路は ID の末尾の大文字、
 * 番号は型番からピンの名前の表で引く。** 型番が表に無い・回路の字が無いときは今までの図のまま。
 */

const partOf = (line: string): PartSpec => {
  const part = parseFence(`parts:\n  ${line}\n`).doc.parts[0];
  if (part === undefined) throw new Error(line);
  return part;
};

const numbers = (line: string) => gateNumbersOf(partOf(line)).numbers.map(({ anchor, text }) => `${anchor}=${text}`);

describe('番号の引き方', () => {
  test('numbers the inputs and the output of the unit named by the last letter of the id', () => {
    expect(numbers('U1A: nand 3,3 74HC00')).toEqual(['in 1=1', 'in 2=2', 'out=3']);
    expect(numbers('U1B: nand 3,3 74HC00')).toEqual(['in 1=4', 'in 2=5', 'out=6']);
    expect(numbers('U1D: nand 3,3 74HC00')).toEqual(['in 1=12', 'in 2=13', 'out=11']);
  });

  test('reads a NOR whose output comes first on the package', () => {
    expect(numbers('U2A: nor 3,3 74HC02')).toEqual(['in 1=2', 'in 2=3', 'out=1']);
  });

  test('numbers an inverter and a buffer with one input', () => {
    expect(numbers('U3C: not 3,3 74HC14')).toEqual(['in=5', 'out=6']);
    expect(numbers('U4B: buffer 3,3 74HC125')).toEqual(['in=5', 'out=6']);
  });

  test('says nothing without a unit letter, without a model, or for a model that is not a gate', () => {
    for (const line of ['U1: nand 3,3 74HC00', 'U1A: nand 3,3', 'U1A: nand 3,3 LM9999', 'U1A: nand 3,3 74HC74', 'GATEA: nand 3,3 74HC00']) {
      expect(gateNumbersOf(partOf(line)), line).toEqual({ numbers: [], problem: null });
    }
  });

  test('says which units exist when the letter is past the last one', () => {
    expect(gateNumbersOf(partOf('U1E: nand 3,3 74HC00')).problem).toBe('U1E: 74HC00 の回路は A・B・C・D までです');
  });

  test('keeps the numbers off a symbol with a different number of inputs', () => {
    const result = gateNumbersOf(partOf('U1A: nand 3,3 74HC10'));

    expect(result.numbers).toEqual([]);
    expect(result.problem).toContain('3 入力');
  });
});

describe('図', () => {
  const texOf = (...lines: string[]): string => {
    const { doc } = parseFence(`parts:\n${lines.map((line) => `  ${line}`).join('\n')}\n`);
    return generateTex(buildCircuit(doc).circuit, { style: { ...doc.style, stamp: false } }).tex;
  };

  test('puts one marker at each pin, in the order the overlays come', () => {
    const tex = texOf('U1A: nand 3,3 74HC00');

    expect(tex).toContain('(part-U1A.in 1)');
    expect(tex).toContain('(part-U1A.in 2)');
    expect(tex).toContain('(part-U1A.out)');
  });

  test('puts no marker on a gate without numbers', () => {
    expect(texOf('U1: nand 3,3 74HC00')).not.toContain('(part-U1.in 1)');
  });

  test('writes the real digits into the exported .tex', () => {
    const { doc } = parseFence('parts:\n  U1B: nand 3,3 74HC00\n');
    const { tex } = generateTex(buildCircuit(doc, { target: 'latex' }).circuit, {
      style: { ...doc.style, stamp: false }, target: 'latex',
    });

    expect(tex).toMatch(/at \(part-U1B\.in 1\) \{4\}/);
    expect(tex).toMatch(/at \(part-U1B\.out\) \{6\}/);
  });

  test('hands the digits to the svg overlay: ends of the input side on the left, starts on the right', () => {
    const { doc } = parseFence('parts:\n  U1B: nand 3,3 74HC00\n');
    const { notes } = generateTex(buildCircuit(doc).circuit, { style: { ...doc.style, stamp: false } });

    expect(notes.map((note) => [note.text, note.align])).toEqual([['4', 'right'], ['5', 'right'], ['6', 'left']]);
  });
});

describe('お知らせ', () => {
  test('tells a unit that does not exist, and a gate with the wrong number of inputs', async () => {
    const result = await compileCircuit('parts:\n  U1E: nand 3,3 74HC00\n  U2A: nand 6,3 74HC10\n');
    const said = result.notices.map((one) => one.message).join('\n');

    expect(said).toContain('U1E: 74HC00 の回路は A・B・C・D までです');
    expect(said).toContain('U2A: 74HC10 は 3 入力');
  });
});
