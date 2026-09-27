import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { WAVE_SHAPES, extractFences } from 'fence-kit';
import { MEASURE_NAMES } from './model/measure.ts';
import { OP_NAMES } from './model/ops.ts';
import { THEME_NAMES } from './limits.ts';
import { CHANNEL_KEYS } from './parser/parseFence.ts';
import { EMPTY_STYLE } from './parser/style.ts';
import { TOP_LEVEL_KEYS } from './types.ts';
import { extractScopeFences, renderScope } from './index.ts';

/**
 * 早見表は**プロンプトに貼る前提**の 1 枚なので、載っている名前が実装から
 * 遅れていると、そのまま書けないフェンスを書かせることになる。
 * 実装の側の定数と突き合わせて載せ漏れを落とし、載せた例が読めることを見る
 * (breadboard-fence の cheatsheet.test.ts の写し)。
 */
const CHEATSHEET = readFileSync(fileURLToPath(new URL('../../docs/02-cheatsheet.md', import.meta.url)), 'utf8');

/** 語は `` `語 `` の形で載っていること (短い語 `rc` `dc` が別の語の中で見つかって通らないように)。 */
const listed = (name: string) => (text: string) => expect(CHEATSHEET, `${name}: ${text}`).toContain(`\`${text}`);
/** キーは `キー:` の形で載っていること。 */
const keyListed = (key: string) => expect(CHEATSHEET, `最上位のキー: ${key}`).toContain(`${key}:`);

/** 「かたち」の ````text の中の ```scope と、```yaml の例の全部。 */
const examples = (): readonly string[] => [
  ...extractFences(CHEATSHEET, 'text').flatMap((block) => extractScopeFences(block.source).map((fence) => fence.source)),
  ...extractFences(CHEATSHEET, 'yaml').map((block) => block.source),
];

describe('docs/02-cheatsheet.md', () => {
  test('names every key the fence can carry', () => {
    TOP_LEVEL_KEYS.forEach(keyListed);
  });

  test('names every wave, operation and measurement', () => {
    WAVE_SHAPES.forEach(listed('波'));
    ['offset', 'phase', 'duty'].forEach(listed('波の語'));
    OP_NAMES.forEach(listed('操作'));
    MEASURE_NAMES.forEach(listed('measure: の名前'));
  });

  test('names every item a channel map can take', () => {
    CHANNEL_KEYS.forEach(listed('ch の並び'));
  });

  test('names every style key and theme', () => {
    Object.keys(EMPTY_STYLE).forEach(listed('style の項目'));
    THEME_NAMES.forEach(listed('テーマ'));
  });

  test('has examples to read', () => {
    expect(examples().length).toBeGreaterThan(3);
  });

  test.each(examples().map((source, index) => [index + 1, source] as const))('example %i reads without an error', (_, source) => {
    // **例は読めること。** お知らせ (time: の既定・data: が見つからない) は例の短さのためなので見ない。
    expect(renderScope(source).errors).toEqual([]);
  });
});
