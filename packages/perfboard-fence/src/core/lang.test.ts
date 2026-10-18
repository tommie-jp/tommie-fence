import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { extractPerfboardFences } from './fences.ts';
import { renderPerfboard } from './index.ts';

const EXAMPLES = fileURLToPath(new URL('../../examples/', import.meta.url));
const JAPANESE = /[぀-ヿ一-鿿＀-￯]/u;

const unescapeXml = (text: string): string =>
  text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

/** SVG の <text> の中身 (タグを除いて字だけ。縁取りの写しは 1 つにまとめる)。 */
const textsOf = (svg: string): string[] => [...new Set(
  [...svg.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)].map((match) => unescapeXml((match[1] ?? '').replace(/<[^>]+>/g, ''))),
)];

const FENCE = [
  'board: 5x7cm',
  'style:',
  '  theme: mono',
  '  back: on',
  'parts:',
  '  R1: resistor b3 b7 10k',
  '  U1: dip14 e10 CD4081',
  'wires:',
  '  - b3 -- f3 red',
  '  - b7 -- f7 blue',
  'notes:',
  '  - parts',
].join('\n');

describe('lang: en', () => {
  test('prints the parts table, the color legend and the solder side caption in English', () => {
    const { svg, errors } = renderPerfboard(`lang: en\n${FENCE}\n`);
    const shown = textsOf(svg).join('\n');

    expect(errors).toEqual([]);
    expect(textsOf(svg)).toEqual(expect.arrayContaining(['Part', 'Type', 'Value', 'Color / mark', 'Board', 'Color', 'Solder side (board flipped)']));
    expect(shown).toContain('5x7cm (18×24 holes) 1.6mm FR-4');
    expect(shown).toContain('CD4081 (2-input AND ×4)');
    expect(shown).toMatch(/\bred\b/);
    expect(textsOf(svg).filter((text) => JAPANESE.test(text))).toEqual([]);
  });

  test('lets options.lang win over the YAML lang', () => {
    expect(textsOf(renderPerfboard(`lang: ja\n${FENCE}\n`, { lang: 'en' }).svg)).toContain('Part');
    expect(textsOf(renderPerfboard(`lang: en\n${FENCE}\n`, { lang: 'ja' }).svg)).toContain('部品');
  });

  test('keeps the Japanese output byte-identical when lang is ja or omitted', () => {
    expect(renderPerfboard(`lang: ja\n${FENCE}\n`).svg).toBe(renderPerfboard(`${FENCE}\n`).svg);
    expect(textsOf(renderPerfboard(`${FENCE}\n`).svg)).toEqual(expect.arrayContaining(['部品', '基板', '色', '赤', '半田面 (裏返した基板)']));
  });

  test('reports an unknown language like other input errors', () => {
    const { errors } = renderPerfboard(`lang: fr\n${FENCE}\n`);

    expect(errors.map((error) => error.message)).toEqual(['lang は ja か en です (fr)']);
  });

  test('applies the outer lang to every sheet', () => {
    const source = [
      'lang: en', 'sheets:', '  - name: a', '    board: 5x7cm', '    parts:', '      R1: resistor b3 b7 10k', '    notes:', '      - parts',
      '  - name: b', '    board: 5x7cm', '    parts:', '      R2: resistor b3 b7 10k', '    notes:', '      - parts',
    ].join('\n');
    const { svg, errors } = renderPerfboard(source);

    expect(errors).toEqual([]);
    expect(textsOf(svg).filter((text) => text === 'Part')).toHaveLength(1);
    expect(textsOf(svg)).not.toContain('部品');
  });

  const markdownFiles = readdirSync(EXAMPLES).filter((name) => name.endsWith('.md') && name !== 'README.md').sort();

  test.each(markdownFiles)('%s leaves no Japanese the writer did not write', (name) => {
    const fences = extractPerfboardFences(readFileSync(join(EXAMPLES, name), 'utf8'));

    fences.forEach((fence) => {
      const { svg } = renderPerfboard(fence.source, { lang: 'en' });
      const own = textsOf(svg)
        .filter((text) => JAPANESE.test(text))
        // 書いた字は、長いと `…` で切られ、名札では ID や値と空白で並ぶ。
        // 日本語を含む語がどれも書いた字の中にあれば書き手の字。
        .filter((text) => text.split(/[\s・]+/).some((word) => JAPANESE.test(word) && !fence.source.includes(word.replace(/…$/, ''))));

      expect(own, name).toEqual([]);
    });
  });
});
