import { describe, expect, test } from 'vitest';
import { extractBreadboardFences } from './fences.ts';

/**
 * 取り出しの規則そのもの (閉じ記号の対応、CRLF、入れ子、字下げ) は
 * fence-kit の `fences.test.ts` が見ている。ここで見るのは
 * **この包みが `breadboard` を渡していること**だけ。
 */
describe('extractBreadboardFences', () => {
  test('finds a breadboard fence and reports the line it opens on', () => {
    const markdown = ['# title', '', '```breadboard', 'board: half', '```', ''].join('\n');

    expect(extractBreadboardFences(markdown)).toEqual([{ source: 'board: half\n', line: 3 }]);
  });

  test('ignores a fence written in another fence language', () => {
    const markdown = ['```circuit', 'parts:', '```'].join('\n');

    expect(extractBreadboardFences(markdown)).toEqual([]);
  });

  test('ignores fences written in another language', () => {
    const markdown = ['```yaml', 'board: half', '```'].join('\n');

    expect(extractBreadboardFences(markdown)).toEqual([]);
  });
});
