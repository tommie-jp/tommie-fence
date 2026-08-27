import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { isDrawable } from './tex/escape.ts';
import { STAMP_TEXT, VERSION } from './version.ts';

/**
 * バージョンは `package.json` が持ち主。core は Node を使えないので
 * (CLAUDE.md 設計上の約束 1) 写しを定数で持つが、**写しがずれると
 * 図に古い番号が焼き付く**。表示が無いことより嘘の表示のほうが害が大きいので、
 * ここで見張る。
 */
const PACKAGE = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../package.json', import.meta.url)), 'utf8'),
) as { readonly version: string };

describe('VERSION', () => {
  test('is the same version package.json declares', () => {
    expect(VERSION).toBe(PACKAGE.version);
  });

  test('is made only of characters the fence TeX can draw', () => {
    // 刻印は TeX に渡る。通らない字が入ると、図そのものが描けなくなる。
    expect(isDrawable(VERSION, 'fence')).toBe(true);
    expect(isDrawable(STAMP_TEXT, 'fence')).toBe(true);
  });

  test('names the tool as well as the number', () => {
    expect(STAMP_TEXT).toContain(VERSION);
    expect(STAMP_TEXT).toContain('circuit-fence');
  });
});
