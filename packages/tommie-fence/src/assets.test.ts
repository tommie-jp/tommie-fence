import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { ASSETS } from './assets.ts';
import manifest from '../package.json' with { type: 'json' };

/**
 * プレビューの CSS と文法ファイルは 3 つのコアから**写して**いる
 * (`.vsix` は拡張の中しか見ない)。**原本はコアのまま**なので、写しが古く
 * なっていないことをここで見張る — 古いと図の色や色分けだけが静かにずれる。
 */
const read = (path: string): string => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('コアから写した資材', () => {
  test('keeps every copy the same as the core it came from', () => {
    for (const [from, to] of ASSETS) {
      expect(read(to), to).toBe(read(from));
    }
  });

  test('has a copy for every style and grammar the manifest points at', () => {
    const wanted = [
      ...manifest.contributes['markdown.previewStyles'].filter((path) => !path.includes('node_modules')),
      ...manifest.contributes.grammars.map((one) => one.path),
    ].map((path) => path.replace('./', ''));

    expect(wanted.every((path) => ASSETS.some(([, to]) => to === path))).toBe(true);
    expect(wanted).toHaveLength(ASSETS.length);
  });
});
