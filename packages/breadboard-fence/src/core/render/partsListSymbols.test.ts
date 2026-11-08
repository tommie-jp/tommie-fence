import { describe, expect, test } from 'vitest';
import { renderBreadboard } from '../index.ts';

/**
 * 部品表の最後の欄を図の中の部品の絵にする (`parts-list: symbols`、52 の依頼)。
 * 既定 (`below`) は今までどおり帯の色の四角と記号の字。
 */
const fence = (...lines: string[]) => lines.join('\n');
const source = (mode: string | null) => fence(
  'board: half',
  ...(mode === null ? [] : [`parts-list: ${mode}`]),
  'parts:',
  '  R1: resistor a5 a10 10k',
  '  C1: capacitor/ceramic c12 c14 22p',
  '  U1: dip8 @ e20 NE555',
);
const listOf = (svg: string): string => svg.slice(svg.indexOf('部品'));

describe('parts-list: symbols', () => {
  test('the last heading reads 記号 and the table draws the parts as in the figure', () => {
    const { svg, errors } = renderBreadboard(source('symbols'));
    expect(errors).toEqual([]);
    const list = listOf(svg);
    expect(list).toContain('>記号<');
    expect(list).not.toContain('色・記号');
    // 抵抗とコンデンサの 2 つぶんの絵。DIP は絵を持たないので欄は空。
    expect(list.match(/class="cf-icon"/g)).toHaveLength(2);
  });

  test('the drawing carries the value (the resistor bands of 10k)', () => {
    const symbols = listOf(renderBreadboard(source('symbols')).svg);
    const other = listOf(renderBreadboard(source('symbols').replace('10k', '220')).svg);
    expect(symbols).not.toEqual(other);
  });

  test('the default keeps the colour swatches and the 色・記号 heading', () => {
    const list = listOf(renderBreadboard(source(null)).svg);
    expect(list).toContain('色・記号');
    expect(list).not.toContain('class="cf-icon"');
  });

  test('rows are taller so the drawings fit', () => {
    const height = (svg: string) => Number(/viewBox="[^"]* [^"]* [^"]* ([\d.]+)"/.exec(svg)?.[1]);
    expect(height(renderBreadboard(source('symbols')).svg)).toBeGreaterThan(height(renderBreadboard(source(null)).svg));
  });

  test('a misspelt mode names all three words', () => {
    const { errors } = renderBreadboard(source('pictures'));
    expect(errors[0]?.message).toContain('symbols');
  });
});
