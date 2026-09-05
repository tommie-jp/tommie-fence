import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import manifest from '../package.json' with { type: 'json' };
import { ASSETS } from './assets.ts';

/**
 * VS Code に出すもの (52 の docs/19)。**3 つぶんを 1 つに畳んだ**ので、
 * 3 つとも載っていることをここで見張る — 落ちても図が出ないだけで、
 * エラーにはならない。
 */
const grammarOf = (path: string): { readonly scopeName: string } =>
  JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));

describe('3 つを 1 つに畳んだ contributes', () => {
  test('registers one custom editor, which is the whole point of folding', () => {
    // `customEditors` は中身で絞れない (`when` が無い) ので、一覧を 1 つに
    // するには登録する拡張を 1 つにするしかない。
    expect(manifest.contributes.customEditors).toHaveLength(1);
    expect(manifest.contributes.customEditors[0]?.viewType).toBe('tommie-fence.map');
  });

  test('points every grammar at a file it actually ships', () => {
    // **原本は 3 つのコア**。写しが古くないことは `assets.test.ts` が見る。
    const copied = ASSETS.map(([, to]) => `./${to}`);

    for (const grammar of manifest.contributes.grammars) {
      expect(copied, grammar.path).toContain(grammar.path);
      expect(grammarOf(grammar.path).scopeName).toBe(grammar.scopeName);
    }
    expect(manifest.contributes.grammars).toHaveLength(3);
  });

  test('keeps the old command ids, so a key binding written before the fold still works', () => {
    // **一度公開した命令の名前は消さない。** 新しい名前へ流す (`commands.ts`)。
    const ids = manifest.contributes.commands.map((one) => one.command);

    expect(ids).toContain('tommie-fence.openMap');
    expect(ids).toContain('circuit-fence.movePart');
    expect(ids).toContain('circuit-fence.movePoint');
  });
});
