import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { NOTE_ALIGNS, NOTE_COLORS, NOTE_KINDS, NOTE_LEADINGS, NOTE_SIZES } from './notes.ts';
import { aliasNames } from './parts/aliases.ts';
import { boardPartNames } from 'fence-kit';
import { typesWithVariants, variantsOf } from './parts/variants.ts';
import { knownPartTypes } from './placement/footprints.ts';
import { TOP_LEVEL_KEYS } from './parser/parseFence.ts';
import { STYLE_KEYS } from './parser/style.ts';
import { THEME_NAMES } from './render/theme.ts';
import { BOARD_SIZES } from './types.ts';
import { wireColorNames } from './render/palette.ts';
import { VERSION } from './version.ts';

/**
 * 文法メモが実装から遅れていないかを見張る。早見表 (`cheatsheet.test.ts`) と
 * 同じ立て付けだが、こちらは**説明のある側**なので、名前を載せ忘れると
 * 「書けるのに誰も知らない文法」が生まれる。
 */
const SYNTAX = readFileSync(fileURLToPath(new URL('../../docs/01-syntax.md', import.meta.url)), 'utf8');

const listed = (name: string) => (text: string) => expect(SYNTAX, `${name}: ${text}`).toContain(text);

describe('docs/01-syntax.md', () => {
  test('名前を出す前に、まず節がひととおりある', () => {
    for (const heading of ['## 文法', '## エラーとお知らせの出方', '## 実例集']) {
      expect(SYNTAX).toContain(heading);
    }
  });

  test('フェンスに書ける最上位のキーが全部載っている', () => {
    TOP_LEVEL_KEYS.forEach(listed('最上位のキー'));
  });

  test('描ける部品の種類が全部載っている', () => {
    knownPartTypes().forEach(listed('部品の種類'));
  });

  test('略記が全部載っている', () => {
    aliasNames().forEach(listed('略記'));
  });

  test('選べる姿が全部載っている', () => {
    for (const type of typesWithVariants()) {
      variantsOf(type).forEach(listed(`${type} の姿`));
    }
  });

  test('マイコンボードが全部載っている', () => {
    boardPartNames().forEach(listed('マイコンボード'));
  });

  test('注釈の語が全部載っている', () => {
    [...NOTE_KINDS, ...NOTE_COLORS, ...NOTE_SIZES, ...NOTE_ALIGNS, ...NOTE_LEADINGS].forEach(listed('注釈の語'));
  });

  test('ボードのサイズが全部載っている', () => {
    BOARD_SIZES.forEach(listed('ボードのサイズ'));
  });

  test('style の項目とテーマが全部載っている', () => {
    STYLE_KEYS.forEach(listed('style の項目'));
    THEME_NAMES.forEach(listed('テーマ'));
  });

  test('配線の色が全部載っている', () => {
    wireColorNames().forEach(listed('配線の色'));
  });

  test('刻印の例に書いてある版が、いまの版と同じ', () => {
    // `stamp: on` の説明に版の数字を書いてあるので、上げたときに置き去りにしない。
    expect(SYNTAX).toContain(`breadboard-fence ${VERSION}`);
  });
});
