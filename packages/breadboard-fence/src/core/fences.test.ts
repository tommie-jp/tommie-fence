import { describe, expect, test } from 'vitest';
import { extractBreadboardFences } from './fences.ts';

describe('extractBreadboardFences', () => {
  test('finds a breadboard fence and reports the line it opens on', () => {
    const markdown = ['# title', '', '```breadboard', 'board: half', '```', ''].join('\n');

    expect(extractBreadboardFences(markdown)).toEqual([{ source: 'board: half\n', line: 3 }]);
  });

  test('ignores fences written in another language', () => {
    const markdown = ['```yaml', 'board: half', '```'].join('\n');

    expect(extractBreadboardFences(markdown)).toEqual([]);
  });

  test('reads a fence written with tildes', () => {
    const markdown = ['~~~breadboard', 'board: full', '~~~'].join('\n');

    expect(extractBreadboardFences(markdown)[0]?.source).toBe('board: full\n');
  });

  test('finds every fence in a document', () => {
    const markdown = ['```breadboard', 'a', '```', 'text', '```breadboard', 'b', '```'].join('\n');

    expect(extractBreadboardFences(markdown)).toHaveLength(2);
  });

  test('ignores a breadboard fence quoted inside a longer fence', () => {
    const markdown = ['````markdown', '```breadboard', 'board: half', '```', '````'].join('\n');

    expect(extractBreadboardFences(markdown)).toEqual([]);
  });

  test('accepts an info string that carries extra words', () => {
    const markdown = ['```breadboard title="LED"', 'board: half', '```'].join('\n');

    expect(extractBreadboardFences(markdown)).toHaveLength(1);
  });

  test('reads a fence that the document never closes', () => {
    const markdown = ['```breadboard', 'board: half'].join('\n');

    expect(extractBreadboardFences(markdown)[0]?.source).toBe('board: half\n');
  });

  test('returns an empty list when the document has no fence', () => {
    expect(extractBreadboardFences('plain text')).toEqual([]);
  });
});
