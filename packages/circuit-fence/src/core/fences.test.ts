import { describe, expect, test } from 'vitest';
import { extractCircuitFences } from './fences.ts';

/**
 * 取り出しの規則そのもの (閉じ記号の対応、CRLF、入れ子、字下げ) は
 * fence-kit の `fences.test.ts` が見ている。ここで見るのは
 * **この包みが `circuit` を渡していること**だけ。
 */
describe('extractCircuitFences', () => {
  test('finds a circuit fence and reports the line it opens on', () => {
    const markdown = ['# title', '', '```circuit', 'parts:', '```', ''].join('\n');

    expect(extractCircuitFences(markdown)).toEqual([{ source: 'parts:\n', line: 3 }]);
  });

  test('ignores a fence written in another fence language', () => {
    const markdown = ['```breadboard', 'parts:', '```'].join('\n');

    expect(extractCircuitFences(markdown)).toEqual([]);
  });

  // 別の拡張が前から扱っている。取り上げると既存のノートの図が消える。
  test('ignores a tikz fence so the existing extension keeps handling it', () => {
    const markdown = ['```tikz', '\\begin{document}', '```'].join('\n');

    expect(extractCircuitFences(markdown)).toEqual([]);
  });
});
