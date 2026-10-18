import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { dataFrom } from '../cli/data.ts';
import { extractVnaFences, renderVna } from './index.ts';

const EXAMPLES = fileURLToPath(new URL('../../examples/', import.meta.url));
const WORKBOOKS = [
  '/home/tommie/.cache/tommie-fence-wt/wb-en',
  '/home/tommie/52-tommie-fence/tommie-circuit-workbook',
].filter((dir) => existsSync(dir));

const JAPANESE = /[　-〿぀-ヿ㐀-鿿＀-￯]/u;
const textsOf = (svg: string): string[] => [...svg.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)].map((m) => m[1] ?? '');

/**
 * title・注釈の字・コメント・data: の名前・書き出し (source) は利用者が書いた字なので、
 * 英語に替えた入力で描く。数えるのはフェンスが出す固定の字だけ。
 */
const withoutUserText = (source: string): string => source
  .split('\n')
  .filter((line) => !/^\s*#/.test(line) && !/^\s*-\s*source\b/.test(line))
  .map((line) => line
    .replace(/^title:.*$/, 'title: Figure')
    .replace(/^(\s*-\s*(?:text|band|mark)\b[^:]*):.*$/, '$1: note')
    .replace(/^(data:\s*\S+)\s+.*$/, '$1 Calc'))
  .join('\n');
const withLang = (source: string): string => `lang: en\n${withoutUserText(source)}`;

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'node_modules' || entry.name.startsWith('.') || entry.name === 'out') return [];
    const path = `${dir}/${entry.name}`;
    return entry.isDirectory() ? walk(path) : entry.name.endsWith('.md') ? [path] : [];
  });
}

describe('lang', () => {
  test('ja stays the default and en is chosen by lang: or options.lang', () => {
    const source = 'sweep: 1M-100M 101\ndut: R 50\nmarkers: [10M]\n';
    const ja = renderVna(source).svg;
    expect(renderVna(`lang: ja\n${source}`).svg).toBe(ja);
    expect(renderVna(source, { lang: 'ja' }).svg).toBe(ja);
    expect(JAPANESE.test(textsOf(ja).join(''))).toBe(true);
    const en = renderVna(`lang: en\n${source}`).svg;
    expect(renderVna(source, { lang: 'en' }).svg).toBe(en);
    expect(renderVna(`lang: ja\n${source}`, { lang: 'en' }).svg).toBe(en);
    expect(en).toContain('Readings');
    expect(en).toContain('Freq');
  });

  test('a lang other than ja or en is an error on its line', () => {
    const { errors } = renderVna('lang: fr\nsweep: 1M-100M 101\n');
    expect(errors.some((error) => error.message.includes('lang は ja か en です') && error.line === 1)).toBe(true);
  });

  test('en labels for open, short and the ideal key', () => {
    const svg = renderVna('lang: en\nsweep: 1M-100M 101\ndut: R 50\ntraces: [S11 smith]\nmarkers: [10M]\n').svg;
    expect(textsOf(svg).join('|')).toContain('Ideal (dut:)');
  });

  test('en TDR names the peak without Japanese', () => {
    const { svg, readingLines } = renderVna('lang: en\nsweep: 1M-300M 201\ndut: [C 10p, R 50]\ntraces: [S11 tdr]\n');
    expect(JAPANESE.test(textsOf(svg).join(''))).toBe(false);
    expect(JAPANESE.test(readingLines.join(''))).toBe(false);
  });

  const files = [EXAMPLES, ...WORKBOOKS].flatMap((dir) => walk(dir));
  test.each(files.filter((file) => readFileSync(file, 'utf8').includes('```vna')))('%s leaves no Japanese in the text of the figure', (file) => {
    const data = dataFrom(file.slice(0, file.lastIndexOf('/') + 1));
    for (const fence of extractVnaFences(readFileSync(file, 'utf8'))) {
      const { svg } = renderVna(withLang(fence.source), { data });
      const left = textsOf(svg).filter((text) => JAPANESE.test(text));
      expect(left).toEqual([]);
    }
  });
});
