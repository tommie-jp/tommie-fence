import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { dataFrom } from '../cli/data.ts';
import { extractSpectrumFences, renderSpectrum } from './index.ts';

/** かな・漢字・全角の記号。 */
const JAPANESE = /[　-ヿ㐀-鿿＀-￯]/u;

const EXAMPLES = fileURLToPath(new URL('../../examples/', import.meta.url));
/** 教科書のクローン (あれば突き合わせる。`TOMMIE_WORKBOOKS` にコロン区切りで足せる)。 */
const WORKBOOKS = (process.env.TOMMIE_WORKBOOKS ?? '').split(':').filter((path) => path !== '' && existsSync(path));

const markdownIn = (dir: string): readonly string[] =>
  readdirSync(dir).flatMap((name) => {
    if (name === 'node_modules' || name.startsWith('.')) return [];
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return markdownIn(path);
    return name.endsWith('.md') ? [path] : [];
  });

/** 利用者が書いた字 (title: と data: の凡例の名前) を外す — 数えるのはフェンスが出す固定の字だけ。 */
const withoutUserText = (source: string): string =>
  source.split('\n')
    .filter((line) => !/^title:/.test(line))
    .map((line) => line.replace(/^(data:\s*\S+)\s+.*$/, '$1'))
    .join('\n');

const textsOf = (svg: string): readonly string[] => [...svg.matchAll(/<text\b[^>]*>([^<]*)<\/text>/g)].map((m) => m[1] ?? '');

const files = [EXAMPLES, ...WORKBOOKS].flatMap((dir) => markdownIn(dir));

describe('lang: en', () => {
  test('draws the readings, key and status labels in English', () => {
    const source = [
      'device: ad2', 'sweep: 0-20kHz', 'signal: sine 1kHz -10dBm', 'markers: [peak]', 'lang: en',
    ].join('\n');
    const { svg, readingLines, errors } = renderSpectrum(source);
    expect(errors).toEqual([]);
    expect(readingLines[0]).toBe('Readings — Ideal (calculated)');
    expect(readingLines[1]).toContain('Frequency');
    expect(textsOf(svg).join(' ')).toContain('Resolution');
  });

  test('options.lang wins over the YAML lang:', () => {
    const source = 'device: ad2\nsweep: 0-20kHz\nsignal: sine 1kHz -10dBm\nmarkers: [peak]\nlang: ja';
    expect(renderSpectrum(source, { lang: 'en' }).readingLines[0]).toBe('Readings — Ideal (calculated)');
    expect(renderSpectrum(source).readingLines[0]).toBe('読み値 — 理想 (計算)');
  });

  test('names the default label of data: in English', () => {
    const data = dataFrom(EXAMPLES);
    const source = readFileSync(`${EXAMPLES}05-antenna.md`, 'utf8');
    const fence = extractSpectrumFences(source).find((one) => /^data:/m.test(one.source));
    expect(fence).toBeDefined();
    const { readingLines } = renderSpectrum(`${withoutUserText(fence?.source ?? '')}\nlang: en`, { data });
    expect(readingLines[0]).toMatch(/^Readings — Measured \(/);
  });

  test('rejects a language it does not know, like any other input error', () => {
    const { errors } = renderSpectrum('device: ad2\nlang: fr');
    expect(errors.map((error) => error.message)).toContain('lang は ja か en です (fr)');
  });

  test.each(files)('leaves no Japanese in the drawing of %s', (file) => {
    const data = dataFrom(dirname(file));
    for (const fence of extractSpectrumFences(readFileSync(file, 'utf8'))) {
      const source = `${withoutUserText(fence.source)}\nlang: en`;
      const { svg } = renderSpectrum(source, { data });
      expect(svg).not.toBe('');
      expect(textsOf(svg).filter((text) => JAPANESE.test(text))).toEqual([]);
    }
  });
});
