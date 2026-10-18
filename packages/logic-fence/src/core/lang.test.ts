import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { extractLogicFences, renderLogic } from './index.ts';

const JAPANESE = /[　-〿぀-ヿ㐀-䶿一-鿿＀-￯]/u;
const textsOf = (svg: string): string[] => [...svg.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)].map((match) => (match[1] ?? '').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));

const SOURCE = `device: ad3
time: 1ms/div
sample: 1MHz
signals:
  CLK: dio0 clock 500Hz
  A: dio1..dio2 counter on CLK rising sequence 0 1 2 3
cursors: [1ms, 3ms, 5ms]
`;

describe('lang', () => {
  test('keeps the Japanese output unchanged by default', () => {
    const ja = renderLogic(SOURCE);
    expect(ja.svg).toBe(renderLogic(SOURCE, { lang: 'ja' }).svg);
    expect(ja.readingLines[0]).toBe('読み値 — カーソル');
    expect(ja.readings.rows[0]?.[0]).toBe('信号');
    expect(textsOf(ja.svg).some((text) => text.includes('窓'))).toBe(true);
  });

  test('draws the fixed texts in English with lang: en', () => {
    const en = renderLogic(`lang: en\n${SOURCE}`);
    expect(en.errors).toEqual([]);
    expect(en.readingLines[0]).toBe('Readings — Cursors');
    expect(en.readings.rows[0]?.[0]).toBe('Signal');
    expect(en.readings.rows.map((row) => row[0])).toContain('ΔX (from X1)');
    expect(textsOf(en.svg).some((text) => text.includes('window'))).toBe(true);
    expect(textsOf(en.svg).filter((text) => JAPANESE.test(text))).toEqual([]);
  });

  test('options.lang wins over the YAML lang', () => {
    expect(renderLogic(`lang: ja\n${SOURCE}`, { lang: 'en' }).readingLines[0]).toBe('Readings — Cursors');
  });

  test('rejects an unknown language', () => {
    expect(renderLogic(`lang: fr\n${SOURCE}`).errors.map((error) => error.message).join('\n')).toContain('lang は ja か en です');
    expect(renderLogic(SOURCE, { lang: 'fr' as never }).errors.length).toBeGreaterThan(0);
  });
});

/**
 * examples と教科書の図を `lang: en` で描く。書き手が書いた字 (title・レーンの名前) は日本語のままでよいので、
 * <text> を記号と空白で割った語のうち日本語を含む物が、フェンスの本文にそのまま書いてある語かを見る。
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
    textsOf(svg).flatMap((text) => text.split(/[\s()/—·:=,]+/u)).map((word) => word.replace(/…$/u, ''))
      .filter((word) => JAPANESE.test(word) && !source.includes(word));

  test('every example and textbook logic fence', () => {
    let count = 0;
    for (const root of roots) {
      const base = root.startsWith('/') ? root : new URL(`../../${root}`, import.meta.url).pathname;
      for (const file of files(base)) {
        for (const fence of extractLogicFences(readFileSync(file, 'utf8'))) {
          const result = renderLogic(`lang: en\n${fence.source}`);
          count += 1;
          expect(strays(result.svg, fence.source), `${file}:${fence.line}`).toEqual([]);
        }
      }
    }
    expect(count).toBeGreaterThan(3);
  });
});
