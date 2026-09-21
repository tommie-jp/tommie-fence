import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import manifest from '../package.json' with { type: 'json' };
import { ASSETS } from './assets.ts';
import { HAS_FENCE } from './editor/context.ts';

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

  test('puts a button on the title of markdown tabs that hold a fence', () => {
    // **フェンスの無い `.md` には出さない** (`context.ts` の鍵)。命令は実在し、絵を持つ。
    const buttons = manifest.contributes.menus['editor/title'];
    const ids = manifest.contributes.commands.map((one) => one.command);

    expect(buttons).toHaveLength(1);
    for (const button of buttons) {
      expect(ids).toContain(button.command);
      expect(button.group).toBe('navigation');
      expect(button.when).toContain('resourceLangId == markdown');
      expect(button.when).toContain(HAS_FENCE);
      const command: { readonly icon?: string } | undefined =
        manifest.contributes.commands.find((one) => one.command === button.command);
      expect(command?.icon).toMatch(/^\$\([a-z-]+\)$/);
    }
  });

  test('wakes up when a markdown file opens, so the title button and the Problems panel show without the preview', () => {
    // **鍵も Problems も、拡張が起きていないと出ない。** いまは Markdown 拡張が
    // プレビューの部品を読みに来るときに一緒に起きるが、それは向こうの作りの
    // 都合なので当てにしない (52 の docs/57。VS Code 1.138 では外しても起きた)。
    expect(manifest.activationEvents).toContain('onLanguage:markdown');
  });

  test('offers ERC in the Problems panel as a setting that is off by default', () => {
    const properties: Record<string, Record<string, unknown>> = manifest.contributes.configuration.properties;

    expect(properties['tommieFence.problems.erc']).toMatchObject({ type: 'boolean', default: false });
  });

  test('renames the setting to tommieFence but keeps the old name, marked deprecated', () => {
    // **一度公開した設定の名前も消さない** (`mapLook.ts` が両方を読む)。
    const properties: Record<string, Record<string, unknown>> = manifest.contributes.configuration.properties;

    expect(manifest.contributes.configuration.title).toBe('tommie-fence');
    expect(properties['tommieFence.map.noteFrame']).toBeDefined();
    expect(properties['tommieFence.map.noteFrame']?.['deprecationMessage']).toBeUndefined();
    expect(properties['circuitFence.map.noteFrame']?.['deprecationMessage']).toBeTruthy();
  });
});
