import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { extractScopeFences, renderScope } from './index.ts';

const here = dirname(fileURLToPath(import.meta.url));
const EXAMPLES = join(here, '../../examples');
const BOOKS = [
  '/home/tommie/.cache/tommie-fence-wt/wb-en',
  '/home/tommie/52-tommie-fence/tommie-circuit-workbook',
].filter(existsSync);

const KANA_KANJI_WIDE = /[　-〿぀-ヿ㐀-䶿一-鿿＀-￯]+/g;

/** `<text>` の中身 (タグを除いた字)。 */
const textsOf = (svg: string): readonly string[] =>
  [...svg.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)].map((match) => (match[1] ?? '').replace(/<[^>]+>/g, ''));

/** 英語で描いた図の字に残った日本語のうち、利用者が書いた物 (フェンスの中に在る物) でない物。 */
function foreignJapanese(source: string, svg: string): readonly string[] {
  const unescape = (text: string): string => text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  return textsOf(svg).flatMap((text) => (unescape(text).match(KANA_KANJI_WIDE) ?? []).filter((run) => !source.includes(run)));
}

function markdownFiles(dir: string): readonly string[] {
  return readdirSync(dir).flatMap((name) => {
    if (name === 'node_modules' || name.startsWith('.') || name === 'out') return [];
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return markdownFiles(path);
    return name.endsWith('.md') ? [path] : [];
  });
}

const dataFrom = (home: string) => (name: string): string | null => {
  const path = join(home, name);
  return existsSync(path) ? readFileSync(path, 'utf8') : null;
};

const sources = [EXAMPLES, ...BOOKS].flatMap((root) => markdownFiles(root).flatMap((file) => {
  const text = readFileSync(file, 'utf8');
  return extractScopeFences(text).map((fence, index) => ({ name: `${file.replace(root, '')}#${index + 1}`, source: fence.source, home: dirname(file) }));
}));

describe('lang: en', () => {
  test('keeps ja output unchanged when lang is omitted or ja', () => {
    const source = 'ch1: sine 1kHz 1V\ncursors: [0, 1ms]';
    const plain = renderScope(source);
    expect(renderScope(source, { lang: 'ja' }).svg).toBe(plain.svg);
    expect(renderScope(`lang: ja\n${source}`).svg).toBe(plain.svg);
    expect(plain.readingLines[0]).toBe('読み値 — 理想 (計算)');
  });

  test('draws the readings heading and key in English', () => {
    const result = renderScope('ch1: sine 1kHz 1V\ncursors: [0, 1ms]', { lang: 'en' });
    expect(result.readingLines[0]).toBe('Readings — Ideal (calculated)');
    expect(textsOf(result.svg)).toContain('Ideal (calculated)');
    expect(foreignJapanese('', result.svg)).toEqual([]);
  });

  test('reads lang: from the YAML and lets options.lang win', () => {
    expect(renderScope('lang: en\nch1: sine 1kHz 1V').readingLines[0]).toBe('Readings — Ideal (calculated)');
    expect(renderScope('lang: en\nch1: sine 1kHz 1V', { lang: 'ja' }).readingLines[0]).toBe('読み値 — 理想 (計算)');
  });

  test('says an unknown language as an error', () => {
    expect(renderScope('lang: fr\nch1: sine 1kHz 1V').errors.map((error) => error.message).join('\n')).toMatch(/lang は ja か en/);
  });

  test('names the default data legend and the mixed heading in English', () => {
    const csv = 'Time (s),Channel 1 (V)\n0,0\n0.001,1\n0.002,0\n';
    const result = renderScope('data: m.csv\nch3: sine 1kHz 1V', { lang: 'en', data: () => csv });
    expect(result.readingLines[0]).toBe('Readings — Measured (m.csv); CH3 ideal');
  });

  test('has the examples and workbook figures to check', () => {
    expect(sources.length).toBeGreaterThan(10);
  });

  test.each(sources.map((one) => [one.name, one] as const))('%s leaves no fixed Japanese text in English', (_, one) => {
    const result = renderScope(one.source, { lang: 'en', data: dataFrom(one.home) });
    expect(foreignJapanese(one.source, result.svg)).toEqual([]);
  });
});
