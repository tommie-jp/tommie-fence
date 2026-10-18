import { describe, expect, test } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { extractGraphFences, renderGraph } from './index.ts';

const JAPANESE = /[　-〿぀-ヿ㐀-䶿一-鿿＀-￯]/u;
const textsOf = (svg: string): string[] => [...svg.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)].map((match) => (match[1] ?? '').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));

const SOURCE = `x: Frequency Hz log 100..100k
y: Gain dB
lines:
  Out dB: -20*log10(sqrt(1+(x/1.59k)^2))
notes:
  - mark 1.59k
  - peak
`;

describe('lang', () => {
  test('keeps the Japanese output unchanged by default', () => {
    const ja = renderGraph(SOURCE);
    expect(ja.svg).toBe(renderGraph(SOURCE, { lang: 'ja' }).svg);
    expect(ja.readingLines[0]).toBe('読み値 — 理想 (計算)');
    expect(textsOf(ja.svg).some((text) => text.includes('(対数)'))).toBe(true);
  });

  test('draws the fixed texts in English with lang: en', () => {
    const en = renderGraph(`lang: en\n${SOURCE}`);
    expect(en.errors).toEqual([]);
    expect(en.readingLines[0]).toBe('Readings — Ideal (calculated)');
    expect(en.readingLines.join('\n')).toContain('Value');
    expect(textsOf(en.svg).some((text) => text.includes('(log)'))).toBe(true);
    expect(textsOf(en.svg).filter((text) => JAPANESE.test(text))).toEqual([]);
  });

  test('options.lang wins over the YAML lang', () => {
    expect(renderGraph(`lang: ja\n${SOURCE}`, { lang: 'en' }).readingLines[0]).toBe('Readings — Ideal (calculated)');
  });

  test('names the default measured label in English', () => {
    const csv = 'Frequency (Hz),Out (dB)\n1000,-0.5\n10000,-16\n';
    const en = renderGraph(`lang: en\ndata: a.csv\n${SOURCE}`, { data: () => csv });
    expect(en.readingLines[0]).toBe('Readings — Ideal (calculated) and Measured (a.csv)');
    expect(textsOf(en.svg).filter((text) => JAPANESE.test(text))).toEqual([]);
  });

  test('rejects an unknown language', () => {
    const bad = renderGraph(`lang: fr\n${SOURCE}`);
    expect(bad.errors.map((error) => error.message).join('\n')).toContain('lang は ja か en です');
    expect(renderGraph(SOURCE, { lang: 'fr' as never }).errors.length).toBeGreaterThan(0);
  });
});

/**
 * examples と教科書の図を `lang: en` で描く。書き手が書いた字 (title・名前・注釈) は日本語のままでよいので、
 * <text> を記号と空白で割った語のうち日本語を含む物が、フェンスの本文にそのまま書いてある語かを見る。
 * 本文に無い語 = フェンスが出した固定の字。
 */
describe('lang: en leaves no fixed Japanese text', () => {
  const roots = ['examples', '../../../wb-en', '/home/tommie/52-tommie-fence/tommie-circuit-workbook'];
  const files = (dir: string): string[] => {
    if (!existsSync(dir)) return [];
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) return [];
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) return files(path);
      return entry.name.endsWith('.md') ? [path] : [];
    });
  };
  const strays = (svg: string, source: string): string[] =>
    textsOf(svg).flatMap((text) => text.split(/[\s()/—·:=,]+/u)).map((word) => word.replace(/…$/u, '')).filter((word) => JAPANESE.test(word) && !source.includes(word));

  test('every example and textbook graph fence', () => {
    let count = 0;
    for (const root of roots) {
      const base = root.startsWith('/') ? root : new URL(`../../${root}`, import.meta.url).pathname;
      for (const file of files(base)) {
        for (const fence of extractGraphFences(readFileSync(file, 'utf8'))) {
          const csv = (): string => 'x (Hz),y (dB)\n1000,0\n2000,-3\n';
          const result = renderGraph(`lang: en\n${fence.source}`, { data: csv });
          count += 1;
          expect(strays(result.svg, fence.source), `${file}:${fence.line}`).toEqual([]);
        }
      }
    }
    expect(count).toBeGreaterThan(3);
  });
});
