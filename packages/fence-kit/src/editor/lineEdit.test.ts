import { describe, expect, test } from 'vitest';
import { lineEdits } from './lineEdit.ts';

/** 差し替えを当てた字。**右から当てる** (左から当てると後ろの桁がずれる)。 */
const applied = (before: string, after: string): string =>
  [...lineEdits(1, before, after)]
    .sort((a, b) => b.column - a.column)
    .reduce((now, edit) => now.slice(0, edit.column) + edit.text + now.slice(edit.column + edit.length), before);

describe('lineEdits', () => {
  test('同じなら差し替えは無い', () => {
    expect(lineEdits(3, '  R1: resistor a1 a3', '  R1: resistor a1 a3')).toEqual([]);
  });

  // **語の単位で差し替える。** 光らせる場所が語の単位なので、そろえる。
  test('値を直すと、値 1 つぶんの差し替え', () => {
    expect(lineEdits(3, '  R1: resistor a1 a3 10k', '  R1: resistor a1 a3 22k')).toEqual([
      { line: 3, column: 21, length: 3, text: '22k' },
    ]);
  });

  test('部品を動かすと、番地 2 つぶんの差し替え', () => {
    expect(lineEdits(3, '  R1: resistor a1 a3', '  R1: resistor b1 b3').map((edit) => edit.text)).toEqual(['b1', 'b3']);
  });

  test('揃えて書いた行でも、語の単位で差し替える', () => {
    expect(lineEdits(3, '  R1:  resistor a1 a3', '  R1:  resistor b1 b3').map((edit) => edit.column)).toEqual([16, 19]);
  });

  test('値を足すときは、違う所をまとめて 1 つ', () => {
    expect(applied('  R1: resistor a1 a3', '  R1: resistor a1 a3 10k')).toBe('  R1: resistor a1 a3 10k');
  });

  test('値を消すときも、当てた結果が後の字になる', () => {
    expect(applied('  R1: resistor a1 a3 10k', '  R1: resistor a1 a3')).toBe('  R1: resistor a1 a3');
  });

  // **頭と尻が重ならないこと。** 同じ字が続く所で数え過ぎると、長さが負になって字を壊す。
  test('同じ字が続く所でも、当てた結果が後の字になる', () => {
    for (const [before, after] of [['aaa', 'aa'], ['aa', 'aaa'], ['abab', 'ab'], ['a1 a1', 'a1']]) {
      expect(applied(before as string, after as string)).toBe(after);
    }
  });
});
