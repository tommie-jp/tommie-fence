import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import manifest from '../package.json' with { type: 'json' };
import { fenceEditors } from './editor/fences.ts';
import { MAPLESS_LANGUAGES, vnaProblems } from './vna.ts';

/**
 * 骨組みを出すスニペット (52 の docs/57)。**本文がそのフェンスで読めること**を
 * 見張る — コアの文法が変わったとき、スニペットだけが古びて黙って壊れる
 * (出した瞬間に帯が赤くなる骨組みは、無いより悪い)。
 */
type Snippet = { readonly prefix: readonly string[]; readonly body: readonly string[]; readonly description: string };

const contributed: readonly { readonly language: string; readonly path: string }[] = manifest.contributes.snippets;
const fileOf = (path: string): URL => new URL(`../${path}`, import.meta.url);
const snippetsIn = (path: string): readonly [string, Snippet][] =>
  Object.entries(JSON.parse(readFileSync(fileOf(path), 'utf8')) as Record<string, Snippet>);

/** 置き場の印 (`${1:題}` → `題`、`$0` → 空) を外して、確定したあとの字にする。 */
const expand = (line: string): string => line.replace(/\$\{\d+:([^}]*)\}/g, '$1').replace(/\$\d+/g, '');

/** 拡張が描くフェンス。**殻を持つ言語と、殻の無い vna**。 */
const languages = [...fenceEditors().map((one) => one.language), ...MAPLESS_LANGUAGES];
const all = contributed.flatMap((entry) => snippetsIn(entry.path));

describe('フェンスのスニペット', () => {
  test('are contributed to markdown from a file that ships', () => {
    expect(contributed.length).toBeGreaterThan(0);
    for (const entry of contributed) {
      expect(entry.language).toBe('markdown');
      expect(existsSync(fileOf(entry.path)), entry.path).toBe(true);
    }
  });

  test('cover every fence the extension draws', () => {
    const opened = all.map(([, snippet]) => /^```(\S+)/.exec(snippet.body[0] ?? '')?.[1]);

    expect([...opened].sort()).toEqual([...languages].sort());
  });

  test.each(all)('%s opens and closes a fence the extension reads', (_name, snippet) => {
    expect(languages).toContain(snippet.body[0]?.slice(3));
    expect(snippet.body.at(-1)).toBe('```');
    expect(snippet.prefix.length).toBeGreaterThan(0);
  });

  test.each(all)('%s draws without a line the fence cannot read', (_name, snippet) => {
    // Arrange — 確定したあとの本文 (開き記号と閉じ記号の間)。
    const language = snippet.body[0]?.slice(3);
    const editor = fenceEditors().find((one) => one.language === language);
    const source = `${snippet.body.slice(1, -1).map(expand).join('\n')}\n`;

    // Act — 殻の無い vna は Problems の口で見る (帯と同じ報告)。
    const view = editor?.view(source, 1);
    const rows = editor === undefined ? vnaProblems().problems?.(source, 1, { erc: true }) : [];

    // Assert — 読めない行もお知らせも無い (帯が空)。
    expect(language === 'vna' || editor !== undefined).toBe(true);
    expect(view?.issues ?? '').toBe('');
    expect(view?.erc?.count ?? 0).toBe(0);
    expect(rows).toEqual([]);
  });
});
