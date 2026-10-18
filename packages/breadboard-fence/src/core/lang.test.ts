import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { extractBreadboardFences } from './fences.ts';
import { renderBreadboard } from './index.ts';

const EXAMPLES = fileURLToPath(new URL('../../examples/', import.meta.url));
const JAPANESE = /[぀-ヿ一-鿿＀-￯]/u;

const unescapeXml = (text: string): string =>
  text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

/** SVG の <text> の中身 (タグを除いて字だけ)。 */
const textsOf = (svg: string): string[] => [...new Set(
  [...svg.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)].map((match) => unescapeXml((match[1] ?? '').replace(/<[^>]+>/g, ''))),
)];

describe('lang: en', () => {
  test('prints the parts list headings and the board row in English', () => {
    const { svg, errors } = renderBreadboard('lang: en\nparts:\n  R1: resistor a5 a10 10k\n  U1: dip14 @ e20 CD4081\n');
    const shown = textsOf(svg);

    expect(errors).toEqual([]);
    expect(shown).toEqual(expect.arrayContaining(['Part', 'Type', 'Value', 'Color / mark', 'Board', 'half (400 holes)']));
    expect(shown).toContain('CD4081 (2-input AND ×4)');
    expect(shown.filter((text) => JAPANESE.test(text))).toEqual([]);
  });

  test('lets options.lang win over the YAML lang', () => {
    const source = 'lang: ja\nparts:\n  R1: resistor a5 a10 10k\n';

    expect(textsOf(renderBreadboard(source, { lang: 'en' }).svg)).toContain('Part');
    expect(textsOf(renderBreadboard('lang: en\nparts:\n  R1: resistor a5 a10 10k\n', { lang: 'ja' }).svg)).toContain('部品');
  });

  test('keeps the Japanese output byte-identical when lang is ja or omitted', () => {
    const source = 'parts:\n  R1: resistor a5 a10 10k\n  U1: dip14 @ e20 CD4081\n';

    expect(renderBreadboard(`lang: ja\n${source}`).svg).toBe(renderBreadboard(source).svg);
    expect(textsOf(renderBreadboard(source).svg)).toEqual(expect.arrayContaining(['部品', '基板', 'half (400 穴)']));
  });

  test('reports an unknown language like other input errors', () => {
    expect(renderBreadboard('lang: fr\nparts:\n  R1: resistor a5 a10 10k\n').errors.map((error) => error.message))
      .toEqual(['lang は ja か en です (fr)']);
  });

  test('applies the outer lang to every sheet', () => {
    const source = [
      'lang: en', 'sheets:', '  - name: a', '    parts:', '      R1: resistor a5 a10 10k',
      '  - name: b', '    parts:', '      R2: resistor a5 a10 10k',
    ].join('\n');
    const { svg, errors } = renderBreadboard(source);

    expect(errors).toEqual([]);
    expect(textsOf(svg).filter((text) => text === 'Part')).toHaveLength(1);
  });

  const markdownFiles = readdirSync(EXAMPLES).filter((name) => name.endsWith('.md') && name !== 'README.md').sort();

  test.each(markdownFiles)('%s leaves no Japanese the writer did not write', (name) => {
    const fences = extractBreadboardFences(readFileSync(join(EXAMPLES, name), 'utf8'));

    fences.forEach((fence) => {
      const { svg } = renderBreadboard(fence.source, { lang: 'en' });
      const own = textsOf(svg)
        .filter((text) => JAPANESE.test(text))
        // `sheets:` の枚の題の `(N枚め)` は fence-kit の sheets.ts が足す字で、まだ英語にしていない。
        .map((text) => text.replace(/\s*\(\d+枚め\)/, ''))
        // 書いた字は、長いと `…` で切られ、名札では ID や値と空白で並ぶ。
        // 日本語を含む語がどれも書いた字の中にあれば書き手の字。
        .filter((text) => text.split(/[\s・]+/).some((word) => JAPANESE.test(word) && !fence.source.includes(word.replace(/…$/, ''))));

      expect(own, name).toEqual([]);
    });
  });
});
