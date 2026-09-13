import { describe, expect, test } from 'vitest';
import { lineEdit } from './lineEdit.ts';

/** 差し替えを当てた字。当て方が正しいかは、結果の字で見る。 */
const applied = (before: string, after: string): string => {
  const edit = lineEdit(1, before, after);
  if (edit === null) return before;
  return before.slice(0, edit.column) + edit.text + before.slice(edit.column + edit.length);
};

describe('lineEdit', () => {
  test('同じなら差し替えは無い', () => {
    expect(lineEdit(3, '  R1: resistor a1 a3', '  R1: resistor a1 a3')).toBeNull();
  });

  test('違う所だけを差し替える', () => {
    expect(lineEdit(3, '  R1: resistor a1 a3 10k', '  R1: resistor a1 a3 22k')).toEqual({
      line: 3, column: 21, length: 2, text: '22',
    });
  });

  test('末尾に足すときは、足す所に長さ 0 で入れる', () => {
    expect(lineEdit(3, '  R1: resistor a1 a3', '  R1: resistor a1 a3 10k')).toEqual({
      line: 3, column: 20, length: 0, text: ' 10k',
    });
  });

  test('消すときは、消す所を空で差し替える', () => {
    expect(applied('  R1: resistor a1 a3 10k', '  R1: resistor a1 a3')).toBe('  R1: resistor a1 a3');
  });

  // **頭と尻が重ならないこと。** 同じ字が続く所 (`aaa` → `aa`) で数え過ぎると、
  // 長さが負になって字を壊す。
  test('同じ字が続く所でも、当てた結果が後の字になる', () => {
    for (const [before, after] of [['aaa', 'aa'], ['aa', 'aaa'], ['abab', 'ab'], ['a1 a1', 'a1']]) {
      expect(applied(before as string, after as string)).toBe(after);
    }
  });
});
