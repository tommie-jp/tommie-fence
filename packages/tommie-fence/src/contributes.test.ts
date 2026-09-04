import { describe, expect, test } from 'vitest';
import manifest from '../package.json' with { type: 'json' };
import circuit from 'circuit-fence/package.json' with { type: 'json' };
import breadboard from 'breadboard-fence/package.json' with { type: 'json' };
import perfboard from 'perfboard-fence/package.json' with { type: 'json' };

/**
 * VS Code に出すものの突き合わせ (52 の docs/19)。**3 つぶんを 1 つに畳む**ので、
 * 片方に足したときにこちらが落ちるようにしておく。
 */
describe('3 つを 1 つに畳んだ contributes', () => {
  test('registers one custom editor, which is the whole point of folding', () => {
    // `customEditors` は中身で絞れない (`when` が無い) ので、一覧を 1 つに
    // するには登録する拡張を 1 つにするしかない。
    expect(manifest.contributes.customEditors).toHaveLength(1);
    expect(manifest.contributes.customEditors[0]?.viewType).toBe('tommie-fence.map');
  });

  test('carries every grammar the three had', () => {
    const scopes = manifest.contributes.grammars.map((one) => one.scopeName);

    for (const one of [circuit, breadboard, perfboard]) {
      for (const grammar of one.contributes.grammars) expect(scopes).toContain(grammar.scopeName);
    }
  });

  test('keeps the old command ids, so a key binding written before the fold still works', () => {
    // **一度公開した命令の名前は消さない。** 新しい名前へ流す (`commands.ts`)。
    const ids = manifest.contributes.commands.map((one) => one.command);

    expect(ids).toContain('tommie-fence.openMap');
    expect(ids).toContain('circuit-fence.movePart');
    expect(ids).toContain('circuit-fence.movePoint');
  });
});
