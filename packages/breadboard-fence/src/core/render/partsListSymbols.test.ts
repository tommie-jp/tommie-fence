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
    expect(list.match(/class="bf-parts-icon"/g)).toHaveLength(2);
  });

  test('the drawing carries the value (the resistor bands of 10k)', () => {
    const symbols = listOf(renderBreadboard(source('symbols')).svg);
    const other = listOf(renderBreadboard(source('symbols').replace('10k', '220')).svg);
    expect(symbols).not.toEqual(other);
  });

  test('the drawings are the default; below keeps the colour swatches and the 色・記号 heading', () => {
    expect(listOf(renderBreadboard(source(null)).svg)).toContain('>記号<');
    const list = listOf(renderBreadboard(source('below')).svg);
    expect(list).toContain('色・記号');
    expect(list).not.toContain('bf-parts-icon');
  });

  test('rows keep half the text height between them; drawings are two rows tall and interleaved', () => {
    const { svg } = renderBreadboard(source('symbols'));
    const placed = [...svg.matchAll(/class="bf-parts-icon" transform="translate\(([\d.]+) ([\d.]+)\) scale\(([\d.]+)\)/g)]
      .map((m) => ({ x: Number(m[1]), y: Number(m[2]), scale: Number(m[3]) }));
    expect(placed).toHaveLength(2);
    const [first, second] = placed;
    // 行の送りは字の 1.5 倍 (行間が字の 1/2)。絵は 2 行ぶん (上下の隙間 1 px ずつを引く)。
    const line = 12.5 * 1.5;
    expect(26 * first!.scale).toBeCloseTo(2 * line - 2, 0);
    // 次の行の絵は横にずらす。
    expect(second!.x).toBeGreaterThan(first!.x);
  });

  test('odd rows below the heading get a lighter band; even rows keep the plate', () => {
    // 帯は字より先に書くので、図全体で数える。
    const { svg } = renderBreadboard(source('symbols'));
    // 見出しの下は 基板・C1・R1・U1 の 4 行。奇数行 (基板・R1) の 2 本だけ帯が付く。
    expect(svg.match(/fill="#ffffff" fill-opacity="0.45"/g)).toHaveLength(2);
    expect(renderBreadboard(source('below')).svg).not.toContain('fill-opacity="0.45"');
  });

  test('a capacitor written with polarity is drawn as the electrolytic, as in the figure', () => {
    const polar = renderBreadboard(fence('board: half', 'parts:', '  C1: capacitor b5(-) b12(+) 10uF')).svg;
    const plain = renderBreadboard(fence('board: half', 'parts:', '  C1: capacitor b5 b12 10uF')).svg;
    const icon = (svg: string) => /<g class="bf-parts-icon"[\s\S]*?<\/g>/.exec(svg)?.[0];
    expect(icon(polar)).not.toEqual(icon(plain));
  });

  test('a misspelt mode names all three words', () => {
    const { errors } = renderBreadboard(source('pictures'));
    expect(errors[0]?.message).toContain('symbols');
  });
});
