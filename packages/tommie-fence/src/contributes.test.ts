import { readFileSync } from 'node:fs';
import { fenceNames } from 'fence-kit';
import { describe, expect, test } from 'vitest';
import manifest from '../package.json' with { type: 'json' };
import { ASSETS } from './assets.ts';
import { HAS_FENCE } from './editor/context.ts';
import { fenceEditors } from './editor/fences.ts';
import { MAPLESS_LANGUAGES } from './vna.ts';
import { ICON_SIZE } from '../scripts/icon.mjs';
import { iconPng } from '../../playground/scripts/icon.mjs';

/**
 * VS Code に出すもの (52 の docs/19)。**3 つぶんを 1 つに畳んだ**ので、
 * 3 つとも載っていることをここで見張る — 落ちても図が出ないだけで、
 * エラーにはならない。
 */
type Grammar = {
  readonly scopeName: string;
  readonly repository: Record<string, { readonly begin?: string }>;
};

const grammarOf = (path: string): Grammar =>
  JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));

/**
 * 文法の開き記号の正規表現 (Oniguruma) を JS で読める形にする。使っている
 * 書き方は `(?i:…)` と `\G` だけ — 大文字小文字を問わない印を旗へ移し、
 * `\G` (前の一致の終わり) は行頭の `^` と並んでいるので落とす。
 */
const openingOf = (grammar: Grammar): RegExp => {
  const begins = Object.values(grammar.repository).flatMap((one) => (one.begin === undefined ? [] : [one.begin]));
  expect(begins).toHaveLength(1);
  return new RegExp((begins[0] ?? '').replaceAll('(?i:', '(?:').replaceAll('\\G', ''), 'i');
};

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
    expect(manifest.contributes.grammars).toHaveLength(5);
  });

  // 52 の docs/08。**文法の直し忘れがいちばん起きやすい** — プラグインだけ直すと
  // 「図は出るのに色分けが消える」片肺になり、ほかの試験では誰も気づかない。
  test('colours every spelling of every fence, each by exactly one grammar', () => {
    const openings = manifest.contributes.grammars.map((one) => openingOf(grammarOf(one.path)));
    const languages = [...fenceEditors().map((one) => one.language), ...MAPLESS_LANGUAGES];

    for (const name of languages.flatMap(fenceNames)) {
      for (const line of [`\`\`\`${name}`, `~~~${name} title=x`]) {
        expect(openings.filter((one) => one.test(line)), line).toHaveLength(1);
      }
      expect(openings.some((one) => one.test(`\`\`\`${name}s`)), `${name}s`).toBe(false);
    }
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

  test('ships the icon, baked from the same drawing as the playground', () => {
    // **焼いたものを git に入れている** (`scripts/icon.mjs`)。図案が向こうで
    // 変わったのに焼き直し忘れると、ここで分かる。
    const png = readFileSync(new URL(`../${manifest.icon}`, import.meta.url));

    expect(png.subarray(1, 4).toString('latin1')).toBe('PNG');
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([ICON_SIZE, ICON_SIZE]);
    expect(png.equals(iconPng(ICON_SIZE))).toBe(true);
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
