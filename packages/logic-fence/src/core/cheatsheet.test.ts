import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { extractFences } from 'fence-kit';
import { DEVICE_NAMES } from './model/device.ts';
import { RADIXES } from './model/radix.ts';
import { KINDS } from './model/signalSpec.ts';
import { THEME_NAMES } from './limits.ts';
import { EMPTY_STYLE } from './parser/style.ts';
import { TOP_LEVEL_KEYS } from './types.ts';
import { extractLogicFences, renderLogic } from './index.ts';

/**
 * 早見表は**プロンプトに貼る前提**の 1 枚なので、載っている名前が実装から
 * 遅れていると、そのまま書けないフェンスを書かせることになる。
 * 実装の側の定数と突き合わせて載せ漏れを落とし、載せた例が読めることを見る
 * (breadboard-fence の cheatsheet.test.ts の写し)。
 */
const CHEATSHEET = readFileSync(fileURLToPath(new URL('../../docs/02-cheatsheet.md', import.meta.url)), 'utf8');

/** 語は `` `語 `` の形で載っていること (短い語が別の語の中で見つかって通らないように)。 */
const listed = (name: string) => (text: string) => expect(CHEATSHEET, `${name}: ${text}`).toContain(`\`${text}`);
/** キーは `キー:` の形で載っていること。 */
const keyListed = (key: string) => expect(CHEATSHEET, `最上位のキー: ${key}`).toContain(`${key}:`);

/** 「かたち」の ````text の中の ```logic と、```yaml の例の全部。 */
const examples = (): readonly string[] => [
  ...extractFences(CHEATSHEET, 'text').flatMap((block) => extractLogicFences(block.source).map((fence) => fence.source)),
  ...extractFences(CHEATSHEET, 'yaml').map((block) => block.source),
];

describe('docs/02-cheatsheet.md', () => {
  test('names every key the fence can carry', () => {
    TOP_LEVEL_KEYS.forEach(keyListed);
  });

  test('names every device, signal kind and radix', () => {
    DEVICE_NAMES.forEach(listed('機種'));
    KINDS.forEach(listed('種類'));
    RADIXES.forEach(listed('基数'));
    for (const word of ['rising', 'falling', 'uart', 'ascii', 'duty', 'repeat', 'sequence', 'wrap', 'start', 'decode:']) {
      expect(CHEATSHEET, `語: ${word}`).toContain(word);
    }
  });

  test('names every style key and theme', () => {
    Object.keys(EMPTY_STYLE).forEach(listed('style の項目'));
    THEME_NAMES.forEach(listed('テーマ'));
  });

  test('has examples to read', () => {
    expect(examples().length).toBeGreaterThan(3);
  });

  test.each(examples().map((source, index) => [index + 1, source] as const))('example %i reads without an error', (_, source) => {
    expect(renderLogic(source).errors).toEqual([]);
  });

  test.each(examples().map((source, index) => [index + 1, source] as const))('example %i says nothing else either', (_, source) => {
    // 早見表の例はお知らせも出さない (見本がお知らせを出していると、それが正しい書き方に見える)。
    expect(renderLogic(source).notices).toEqual([]);
  });
});
