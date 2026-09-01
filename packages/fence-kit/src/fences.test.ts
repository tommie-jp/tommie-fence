import { describe, expect, test } from 'vitest';
import { extractFences, outputStem } from './fences.ts';

/**
 * 言語名は引数なので、ここでは架空の `demo` で取り出しの規則そのものを見る。
 * 各パッケージ側には「自分の言語を渡している」ことを見るテストだけを残す。
 */
describe('extractFences', () => {
  test('finds a fence and reports the line it opens on', () => {
    const markdown = ['# title', '', '```demo', 'parts:', '```', ''].join('\n');

    expect(extractFences(markdown, 'demo')).toEqual([{ source: 'parts:\n', line: 3 }]);
  });

  // Windows で書いた `.md` は CRLF で来る。揃えないと開き記号の行が
  // `(.*)$` に引っかからず、**フェンスを 1 つも見つけないまま黙って終わる**
  // (CLI が図を 1 枚も書き出さないのに何も言わない状態になっていた)。
  test('finds a fence in a document saved with CRLF', () => {
    const markdown = ['# title', '', '```demo', 'parts:', '```', ''].join('\r\n');

    expect(extractFences(markdown, 'demo')).toEqual([{ source: 'parts:\n', line: 3 }]);
  });

  test('ignores fences written in another language', () => {
    const markdown = ['```yaml', 'parts:', '```'].join('\n');

    expect(extractFences(markdown, 'demo')).toEqual([]);
  });

  test('ignores a fence whose language merely starts with the same letters', () => {
    const markdown = ['```demonstration', 'parts:', '```'].join('\n');

    expect(extractFences(markdown, 'demo')).toEqual([]);
  });

  test('reads a fence written with tildes', () => {
    const markdown = ['~~~demo', 'parts:', '~~~'].join('\n');

    expect(extractFences(markdown, 'demo')[0]?.source).toBe('parts:\n');
  });

  test('finds every fence in a document', () => {
    const markdown = ['```demo', 'a', '```', 'text', '```demo', 'b', '```'].join('\n');

    expect(extractFences(markdown, 'demo')).toHaveLength(2);
  });

  test('ignores a fence quoted inside a longer fence', () => {
    const markdown = ['````markdown', '```demo', 'parts:', '```', '````'].join('\n');

    expect(extractFences(markdown, 'demo')).toEqual([]);
  });

  test('accepts an info string that carries extra words', () => {
    const markdown = ['```demo title="RC"', 'parts:', '```'].join('\n');

    expect(extractFences(markdown, 'demo')).toHaveLength(1);
  });

  test('reads a fence that the document never closes', () => {
    const markdown = ['```demo', 'parts:'].join('\n');

    expect(extractFences(markdown, 'demo')[0]?.source).toBe('parts:\n');
  });

  test('strips the indent an indented fence was written with', () => {
    const markdown = ['- item', '  ```demo', '  parts:', '  ```'].join('\n');

    expect(extractFences(markdown, 'demo')[0]?.source).toBe('parts:\n');
  });

  test('returns an empty list when the document has no fence', () => {
    expect(extractFences('plain text', 'demo')).toEqual([]);
  });

  test('tells the three languages apart in one document', () => {
    const markdown = [
      '```circuit',
      'c',
      '```',
      '```breadboard',
      'b',
      '```',
      '```perfboard',
      'p',
      '```',
    ].join('\n');

    expect(extractFences(markdown, 'circuit')).toEqual([{ source: 'c\n', line: 1 }]);
    expect(extractFences(markdown, 'breadboard')).toEqual([{ source: 'b\n', line: 4 }]);
    expect(extractFences(markdown, 'perfboard')).toEqual([{ source: 'p\n', line: 7 }]);
  });
});

/**
 * 書き出すファイルの名前。CLI・貼った図・スナップショットの期待値が
 * **同じ規則を 3 通りに書き写していた**ので、ここに 1 つ置いて全部から引く。
 */
describe('outputStem', () => {
  test('numbers the outputs when the document has more than one figure', () => {
    expect(outputStem('08-themes', 0, 4)).toBe('08-themes-1');
    expect(outputStem('08-themes', 3, 4)).toBe('08-themes-4');
  });

  test('keeps the bare name when the document has exactly one figure', () => {
    // 連番を付けると 1 枚しかない図まで `-1` を名乗る。CLI の jobsFor が
    // 昔からこう書き分けているので、貼る側もここを見て同じ名前を作る。
    expect(outputStem('01-rc-lowpass', 0, 1)).toBe('01-rc-lowpass');
  });
});
