import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import manifest from '../package.json' with { type: 'json' };

/**
 * 英語が元、日本語は訳 (52 の docs/57)。**表が黙って離れない**ことを見る —
 * 訳し忘れた文は日本語の画面でも英語のまま出て、訳だけ残った文は誰も読まない。
 */
const read = (path: string): string => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const keysOf = (path: string): readonly string[] => Object.keys(JSON.parse(read(path)) as Record<string, string>).sort();

/** manifest の中の `%鍵%`。 */
const placeholders = [...JSON.stringify(manifest).matchAll(/"%([^%"]+)%"/g)].map((found) => found[1] ?? '');

/** 拡張ホストのコード (試験を除く) で `t('…')` に渡している元の文。 */
function sourcesOfT(): readonly string[] {
  const files = readdirSync(new URL('./', import.meta.url), { recursive: true, encoding: 'utf8' })
    .filter((path) => path.endsWith('.ts') && !path.endsWith('.test.ts'));
  return files.flatMap((path) => [...read(`src/${path}`).matchAll(/\bt\(\s*'((?:[^'\\]|\\.)*)'/g)]
    .map((found) => (found[1] ?? '').replace(/\\'/g, "'")));
}

describe('manifest の訳', () => {
  test('has an English and a Japanese entry for every placeholder, and nothing else', () => {
    const wanted = [...new Set(placeholders)].sort();

    expect(wanted.length).toBeGreaterThan(0);
    expect(keysOf('package.nls.json')).toEqual(wanted);
    expect(keysOf('package.nls.ja.json')).toEqual(wanted);
  });
});

describe('拡張ホストの文の訳', () => {
  test('translates every message the code passes to t(), and keeps no stale entry', () => {
    const used = [...new Set(sourcesOfT())].sort();

    expect(used.length).toBeGreaterThan(0);
    expect(keysOf('l10n/bundle.l10n.ja.json')).toEqual(used);
  });

  test('keeps the same placeholders in the translation as in the English', () => {
    const bundle = JSON.parse(read('l10n/bundle.l10n.ja.json')) as Record<string, string>;
    const holes = (text: string): readonly string[] => [...text.matchAll(/\{\d+\}/g)].map((found) => found[0]).sort();

    for (const [english, japanese] of Object.entries(bundle)) expect(holes(japanese), english).toEqual(holes(english));
  });
});
