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

describe('extractBreadboardFences with CRLF', () => {
  const crlf = (text: string): string => text.replace(/\n/g, '\r\n');

  test('finds a fence in a file written with CRLF', () => {
    // **言語名の付いた開き記号の行が CRLF だとどの枝にも入らない。**
    // `(.*)$` の `.` は行終端 (`\r` を含む) に当たらないので、
    // 揃えずに読むと 1 つも見つからないまま黙って終わる。
    const markdown = crlf('# t\n\n```breadboard\nparts:\n  R1: resistor a5 a10\n```\n');

    expect(extractBreadboardFences(markdown)).toHaveLength(1);
  });

  test('reads the same content and line number as the LF version', () => {
    const markdown = '# t\n\n```breadboard\nparts:\n  R1: resistor a5 a10\n```\n';

    expect(extractBreadboardFences(crlf(markdown))).toEqual(extractBreadboardFences(markdown));
  });
});
