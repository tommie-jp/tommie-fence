import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { NOTE_ALIGNS, NOTE_COLORS, NOTE_KINDS, NOTE_LEADINGS, NOTE_SIZES } from './notes.ts';
import { aliasNames } from './parts/aliases.ts';
import { boardPartNames } from './parts/boards.ts';
import { typesWithVariants, variantsOf } from './parts/variants.ts';
import { knownPartTypes } from './placement/footprints.ts';
import { STYLE_KEYS } from './parser/style.ts';
import { THEME_NAMES } from './render/theme.ts';
import { BOARD_SIZES } from './types.ts';
import { wireColorNames } from './render/palette.ts';
import { TOP_LEVEL_KEYS } from './parser/parseFence.ts';

/**
 * 早見表は**プロンプトに貼る前提**の 1 枚なので、載っている名前が実装から
 * 遅れていると、そのまま書けないフェンスを書かせることになる。
 * 実装の側の定数と突き合わせて、載せ漏れを落とす。
 */
const CHEATSHEET = readFileSync(fileURLToPath(new URL('../../docs/02-cheatsheet.md', import.meta.url)), 'utf8');

const listed = (name: string) => (text: string) => expect(CHEATSHEET, `${name}: ${text}`).toContain(text);

describe('docs/02-cheatsheet.md', () => {
  test('names every key the fence can carry', () => {
    TOP_LEVEL_KEYS.forEach(listed('最上位のキー'));
  });

  test('names every part type that can be drawn', () => {
    knownPartTypes().forEach(listed('部品の種類'));
  });

  test('names every shorthand', () => {
    aliasNames().forEach(listed('略記'));
  });

  test('names every look a part can be drawn as', () => {
    for (const type of typesWithVariants()) {
      variantsOf(type).forEach(listed(`${type} の姿`));
    }
  });

  test('names every board it knows', () => {
    boardPartNames().forEach(listed('マイコンボード'));
  });

  test('names every word a note can take', () => {
    [...NOTE_KINDS, ...NOTE_COLORS, ...NOTE_SIZES, ...NOTE_ALIGNS, ...NOTE_LEADINGS].forEach(listed('注釈の語'));
  });

  test('names every board size', () => {
    BOARD_SIZES.forEach(listed('ボードのサイズ'));
  });

  test('names every style key and theme', () => {
    STYLE_KEYS.forEach(listed('style の項目'));
    THEME_NAMES.forEach(listed('テーマ'));
  });

  test('names every wire colour', () => {
    wireColorNames().forEach(listed('配線の色'));
  });
});
