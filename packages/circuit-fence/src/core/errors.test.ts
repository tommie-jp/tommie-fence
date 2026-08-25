import { describe, expect, test } from 'vitest';
import { fail, fenceError, ok, safeToken, shiftErrors } from './errors.ts';

describe('safeToken', () => {
  test('keeps the characters an identifier or a value is written with', () => {
    expect(safeToken('R1')).toBe('R1');
    expect(safeToken('10k')).toBe('10k');
    expect(safeToken('U1.out')).toBe('U1.out');
  });

  test('replaces markup so an error message cannot carry a tag into the page', () => {
    expect(safeToken('<script>alert(1)</script>')).toBe('script alert 1 /script');
  });

  test('trims a token that is too long to sit in an error message', () => {
    expect(safeToken('a'.repeat(40))).toBe(`${'a'.repeat(32)}…`);
  });

  test('collapses whitespace so a multi-line value stays on one line', () => {
    expect(safeToken('a\n\nb')).toBe('a b');
  });
});

describe('fenceError', () => {
  test('carries the line the reader has to go and fix', () => {
    expect(fenceError('斜めです', 3)).toEqual({ message: '斜めです', line: 3 });
  });

  test('accepts a null line for a problem that belongs to no single line', () => {
    expect(fenceError('部品が多すぎます', null)).toEqual({ message: '部品が多すぎます', line: null });
  });

  test('carries the second line the message points at, instead of writing it into the text', () => {
    // 本文に「(2 行目)」と書いてしまうと、Markdown の行へずらすときに直せない。
    expect(fenceError('重なっています', 3, 1)).toEqual({ message: '重なっています', line: 3, related: 1 });
  });
});

describe('Result', () => {
  test('ok carries the value', () => {
    expect(ok(42)).toEqual({ ok: true, value: 42 });
  });

  test('fail carries the message and the line', () => {
    expect(fail('読めません', 7)).toEqual({ ok: false, error: { message: '読めません', line: 7 } });
  });
});

describe('shiftErrors', () => {
  test('moves the line from the fence to the document', () => {
    expect(shiftErrors([fenceError('斜めです', 3)], 10)).toEqual([{ message: '斜めです', line: 13 }]);
  });

  test('moves the line the message points at as well', () => {
    // 片方だけ動かすと、帯の「(2 行目)」だけが元のフェンスの行を指したままになる。
    expect(shiftErrors([fenceError('重なっています', 3, 2)], 10)).toEqual([
      { message: '重なっています', line: 13, related: 12 },
    ]);
  });

  test('leaves an error that belongs to no line where it is', () => {
    expect(shiftErrors([fenceError('部品が多すぎます', null)], 10)).toEqual([
      { message: '部品が多すぎます', line: null },
    ]);
  });
});
