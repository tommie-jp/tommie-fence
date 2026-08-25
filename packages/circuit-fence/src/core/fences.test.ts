import { describe, expect, test } from 'vitest';
import { extractCircuitFences } from './fences.ts';

describe('extractCircuitFences', () => {
  test('finds a circuit fence and reports the line it opens on', () => {
    const markdown = ['# title', '', '```circuit', 'parts:', '```', ''].join('\n');

    expect(extractCircuitFences(markdown)).toEqual([{ source: 'parts:\n', line: 3 }]);
  });

  test('ignores fences written in another language', () => {
    const markdown = ['```yaml', 'parts:', '```'].join('\n');

    expect(extractCircuitFences(markdown)).toEqual([]);
  });

  test('ignores a tikz fence so the existing extension keeps handling it', () => {
    const markdown = ['```tikz', '\\begin{document}', '```'].join('\n');

    expect(extractCircuitFences(markdown)).toEqual([]);
  });

  test('reads a fence written with tildes', () => {
    const markdown = ['~~~circuit', 'parts:', '~~~'].join('\n');

    expect(extractCircuitFences(markdown)[0]?.source).toBe('parts:\n');
  });

  test('finds every fence in a document', () => {
    const markdown = ['```circuit', 'a', '```', 'text', '```circuit', 'b', '```'].join('\n');

    expect(extractCircuitFences(markdown)).toHaveLength(2);
  });

  test('ignores a circuit fence quoted inside a longer fence', () => {
    const markdown = ['````markdown', '```circuit', 'parts:', '```', '````'].join('\n');

    expect(extractCircuitFences(markdown)).toEqual([]);
  });

  test('accepts an info string that carries extra words', () => {
    const markdown = ['```circuit title="RC"', 'parts:', '```'].join('\n');

    expect(extractCircuitFences(markdown)).toHaveLength(1);
  });

  test('reads a fence that the document never closes', () => {
    const markdown = ['```circuit', 'parts:'].join('\n');

    expect(extractCircuitFences(markdown)[0]?.source).toBe('parts:\n');
  });

  test('strips the indent an indented fence was written with', () => {
    const markdown = ['- item', '  ```circuit', '  parts:', '  ```'].join('\n');

    expect(extractCircuitFences(markdown)[0]?.source).toBe('parts:\n');
  });

  test('returns an empty list when the document has no fence', () => {
    expect(extractCircuitFences('plain text')).toEqual([]);
  });
});
