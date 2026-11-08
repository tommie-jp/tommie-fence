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

  test('the next row is shifted sideways (interleaved) and the drawings keep the board size', () => {
    const { svg } = renderPerfboard(source);
    const placed = [...svg.matchAll(/class="pf-parts-icon" transform="translate\(([\d.]+) ([\d.]+)\)"/g)]
      .map((m) => ({ x: Number(m[1]) }));
    expect(placed).toHaveLength(2);
    expect(placed[0]!.x).not.toBe(placed[1]!.x);
    // 基板と同じ大きさで描くので縮めない。名札 (`R1 10k`) は表の欄にあるので絵には入れない。
    expect(svg).not.toMatch(/class="pf-parts-icon" transform="[^"]*scale/);
    const table = svg.slice(svg.indexOf('class="pf-parts-icon"'));
    expect(table).not.toContain('pf-caption');
  });

  test('the table adds pin names to three-lead parts and polarity to diodes and polar capacitors', () => {
    const table = (lines: string) => {
      const { svg } = renderPerfboard(fence('board: 5x7cm', 'parts:', lines, 'notes:', '  - parts'));
      return svg.slice(svg.indexOf('class="pf-parts-icon"'));
    };
    const q = table('  Q1: transistor c5 c6 c7 2SC1815');
    for (const name of ['E', 'C', 'B']) expect(q).toContain(`>${name}</text>`);
    const d = table('  D1: diode a3 a7 1N4148');
    expect(d.indexOf('>A</text>')).toBeGreaterThan(-1);
    expect(d.indexOf('>A</text>')).toBeLessThan(d.indexOf('>K</text>'));
    const c = table('  C1: capacitor/electrolytic a3 a6 100u');
    expect(c).toContain('>+</text>');
    expect(c).toContain('>−</text>');
    expect(table('  C1: capacitor/film j3 m3 100n')).toContain('>104<');
  });

  test('even rows get a faint background, so the odd rows read lighter', () => {
    const { svg } = renderPerfboard(source);
    // 見出しの下は 基板・C1・R1・U1 の 4 行。偶数行 (C1・U1) の 2 本。
    expect(svg.match(/fill-opacity="0.06"/g)).toHaveLength(2);
  });

  test('the position column lists the holes as written, and i= adds the LED current to the value', () => {
    const { svg, errors } = renderPerfboard(fence('board: 5x7cm', 'parts:', '  D1: led a3 a7 red i=3mA', '  U1: dip8 c10 NE555', 'notes:', '  - parts'));
    expect(errors).toEqual([]);
    expect(svg).toContain('>位置<');
    expect(svg).toContain('>a3,a7<');
    expect(svg).toContain('>c10<');
    expect(svg).toContain('>red 3mA<');
  });

  test('i= is refused on parts other than an LED and without a unit', () => {
    expect(renderPerfboard(fence('board: 5x7cm', 'parts:', '  R1: resistor a3 a7 1k i=3mA')).errors[0]?.message).toContain('LED');
    expect(renderPerfboard(fence('board: 5x7cm', 'parts:', '  D1: led a3 a7 red i=3')).errors[0]?.message).toContain('単位');
  });

  test('without - parts there is no table', () => {
    expect(renderPerfboard(source.replace('notes:\n  - parts', '')).svg).not.toContain('pf-parts-icon');
  });
});
