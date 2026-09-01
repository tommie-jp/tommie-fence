import { describe, expect, test } from 'vitest';
import { normalizeNewlines } from './newlines.ts';

describe('normalizeNewlines', () => {
  test('turns CRLF into LF', () => {
    expect(normalizeNewlines('a\r\nb')).toBe('a\nb');
  });

  test('turns a bare CR into LF', () => {
    expect(normalizeNewlines('a\rb')).toBe('a\nb');
  });

  test('leaves LF alone', () => {
    expect(normalizeNewlines('a\nb')).toBe('a\nb');
  });

  // 行番号をそのまま使えるのがこの関数の前提。1 つの改行が 1 つの `\n` に
  // なるだけで行数が変わらないことを、ここで留めておく。
  test('keeps the line count', () => {
    const crlf = ['a', 'b', 'c'].join('\r\n');

    expect(normalizeNewlines(crlf).split('\n')).toHaveLength(3);
  });
});
