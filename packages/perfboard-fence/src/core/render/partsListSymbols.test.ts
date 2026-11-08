import { describe, expect, test } from 'vitest';
import { renderPerfboard } from '../index.ts';

/**
 * 部品表 (`- parts`) の記号の欄は、図と同じ部品の絵 (breadboard の部品表と同じ形。52 の依頼)。
 * 見出しは `記号`、絵は 2 行ぶんの高さで 1 行ごとに左右交互、偶数行に薄い地。
 */
const fence = (...lines: string[]) => lines.join('\n');
const source = fence(
  'board: 14x8',
  'parts:',
  '  R1: resistor c3 c7 10k',
  '  C1: capacitor/electrolytic e3 e4 100u',
  '  U1: dip8 c10 NE555',
  'notes:',
  '  - parts',
);

describe('the parts table draws the parts as in the figure', () => {
  test('the last heading reads 記号, and only the parts that have a drawing get one', () => {
    const { svg, errors } = renderPerfboard(source);
    expect(errors.filter((one) => one.notice !== true)).toEqual([]);
    expect(svg).toContain('>記号<');
    expect(svg).not.toContain('色・記号');
    // 抵抗と電解の 2 つ。DIP は絵を持たないので欄は空。
    expect(svg.match(/class="pf-parts-icon"/g)).toHaveLength(2);
  });

  test('the next row is shifted sideways (interleaved) and the drawings are two rows tall', () => {
    const { svg } = renderPerfboard(source);
    const placed = [...svg.matchAll(/class="pf-parts-icon" transform="translate\(([\d.]+) ([\d.]+)\) scale\(([\d.]+)\)/g)]
      .map((m) => ({ x: Number(m[1]), scale: Number(m[3]) }));
    expect(placed).toHaveLength(2);
    expect(placed[0]!.x).not.toBe(placed[1]!.x);
    // 2 行ぶん (行の送りは字の 1.5 倍) から上下の隙間 1 px ずつを引いた高さ。
    expect(26 * placed[0]!.scale).toBeGreaterThan(20);
  });

  test('even rows get a faint background, so the odd rows read lighter', () => {
    const { svg } = renderPerfboard(source);
    // 見出しの下は 基板・C1・R1・U1 の 4 行。偶数行 (C1・U1) の 2 本。
    expect(svg.match(/fill-opacity="0.06"/g)).toHaveLength(2);
  });

  test('without - parts there is no table', () => {
    expect(renderPerfboard(source.replace('notes:\n  - parts', '')).svg).not.toContain('pf-parts-icon');
  });
});
