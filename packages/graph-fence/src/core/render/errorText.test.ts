import { describe, expect, test } from 'vitest';
import { snippetLines } from './errorText.ts';

describe('snippetLines', () => {
  test('returns nothing when no line was attached', () => {
    expect(snippetLines({ message: 'x', line: 1 })).toEqual([]);
  });

  test('returns the line alone when there is nothing to point at', () => {
    expect(snippetLines({ message: 'x', line: 1, text: 'board: x' })).toEqual(['    board: x']);
  });

  test('counts full-width characters as two columns so the caret hits its target', () => {
    // breadboard-fence は全角を 1 桁と数えていて印がずれる。新しい方は circuit-fence
    // の数え方 (正しいほう) から始める。
    const lines = snippetLines({
      message: 'x',
      line: 1,
      text: 'title: あああ x',
      at: { column: 11, length: 1 },
    });

    expect(lines[1]).toBe(`    ${' '.repeat(14)}^`);
  });
});
