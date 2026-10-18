import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { extractCopperFences, renderCopper } from './index.ts';

const EXAMPLES = fileURLToPath(new URL('../../examples/', import.meta.url));
const BOOKS = [
  '/home/tommie/.cache/tommie-fence-wt/wb-en',
  '/home/tommie/52-tommie-fence/tommie-circuit-workbook',
];

// かな・漢字・全角の記号と句読点。
const JAPANESE = /[　-〿぀-ヿ㐀-鿿＀-￯]/u;

const textsOf = (svg: string): string[] => [...svg.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)].map((match) => match[1] ?? '');

/** 利用者の字 (title・注釈・ラベル) を英語に替えた入力を作る代わりに、固定の字だけを数える。 */
const FIXED = ['Part', 'Type', 'Value', 'Board', 'Back view (mirrored)'];

const sample = `board: 40x20mm
lang: en
title: Figure
copper:
  L1: line 0,8 20,8 3mm
  P1: pad 8,15 3x3mm
parts:
  J1: sma left 10
  C1: capacitor/1608 20,8 10p
notes:
  - parts
style:
  back: on
`;

describe('lang', () => {
  test('the default stays Japanese', () => {
    const { svg } = renderCopper(sample.replace('lang: en\n', ''));
    expect(svg).toContain('部品');
    expect(svg).toContain('裏から見た図');
  });

  test('lang: en puts the fixed texts in English', () => {
    const { svg, errors } = renderCopper(sample);
    expect(errors).toEqual([]);
    const texts = textsOf(svg).join('\n');
    for (const word of FIXED) expect(texts).toContain(word);
    expect(texts.split('\n').filter((text) => JAPANESE.test(text))).toEqual([]);
  });

  test('options.lang wins over the YAML lang', () => {
    const { svg } = renderCopper(sample.replace('lang: en', 'lang: ja'), { lang: 'en' });
    expect(textsOf(svg).join('\n')).toContain('Back view');
  });

  test('a lang that is neither ja nor en is an error', () => {
    expect(renderCopper(sample.replace('lang: en', 'lang: fr')).errors[0]?.message).toContain('lang は ja か en です');
    expect(renderCopper(sample, { lang: 'fr' as 'en' }).errors[0]?.message).toContain('lang は ja か en です');
  });

  test('lang is shared across sheets', () => {
    const { svg, errors } = renderCopper(`lang: en
sheets:
  - name: A
    board: 40x20mm
    copper:
      P1: pad 8,15 3x3mm
  - name: B
    board: 40x20mm
    copper:
      P1: pad 8,15 3x3mm
`);
    expect(errors).toEqual([]);
    expect(textsOf(svg).join('\n')).toContain('Back view (mirrored)');
    expect(textsOf(svg).join('\n')).toContain('Back: solid GND');
  });
});

function markdownIn(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    if (name === 'node_modules' || name.startsWith('.')) return [];
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return markdownIn(path);
    return name.endsWith('.md') ? [path] : [];
  });
}

describe('lang: en leaves no Japanese in the fixed texts', () => {
  // 利用者が日本語で書いた字 (title・注釈・ラベル) は対象外。固定の字が出る行だけを調べる。
  const FIXED_JA = /部品|種類|基板|片面|両面|地なし|裏から見た図|ベタ|溝で切る|表・裏|裏は銅|裏に銅/;

  const cases = [...markdownIn(EXAMPLES), ...BOOKS.flatMap(markdownIn)].flatMap((path) =>
    extractCopperFences(readFileSync(path, 'utf8')).map((fence, index) => ({ name: `${path}#${index}`, source: fence.source })));

  test('there are figures to check', () => {
    expect(cases.length).toBeGreaterThan(0);
  });

  test('every figure renders its own fixed texts in English', () => {
    const bad = cases.flatMap(({ name, source }) => {
      const { svg } = renderCopper(source, { lang: 'en' });
      // 枚の題の「(N枚め)」は fence-kit の sheets.ts が付ける字 (copper-fence の外)。ここでは外して調べる。
      const written = (text: string): boolean => text.replace(/\s*\(\d+枚め\)$/, '').split('・').every((part) => source.includes(part.trim()));
      return textsOf(svg).filter((text) => FIXED_JA.test(text) && !written(text)).map((text) => `${name}: ${text}`);
    });
    expect(bad).toEqual([]);
  });
});
