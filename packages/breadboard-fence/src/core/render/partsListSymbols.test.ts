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
  test('long parts keep the drawings: the leads shorten until the two columns fit', () => {
    const { svg, errors } = renderBreadboard(fence(
      'board: half',
      'parts:',
      '  C3: capacitor/film g9 g17 1u',
      '  C4: capacitor/film j13 j21 1u',
      '  D1: diode b9 b13 1N4148',
      '  R1: resistor d21 d25 100k',
      '  AD:',
      '    type: device',
      '    at: top',
      '    label: Analog Discovery 3',
      '    pins: [2+, W1, GND, 2-, 1+, 1-]',
    ));
    expect(errors).toEqual([]);
    expect(listOf(svg).match(/class="bf-parts-icon"/g)).toHaveLength(4);
  });

  test('a long device description is cut so the drawings still fit', () => {
    const { svg, errors } = renderBreadboard(fence(
      'board: half',
      'parts:',
      '  R1: resistor a5 a10 10k',
      '  R2: resistor c5 c10 10k',
      '  C1: capacitor/electrolytic e5(+) e9(-) 100uF',
      '  AD:',
      '    type: device',
      '    at: top',
      '    label: Analog Discovery (Supplies V+ と Scope と Wavegen の両方)',
      '    pins: [V+, GND]',
    ));
    expect(errors).toEqual([]);
    expect(listOf(svg).match(/class="bf-parts-icon"/g)).toHaveLength(3);
  });

  test('a film capacitor between a row and the rail still carries its code', () => {
    const { svg, errors } = renderBreadboard(fence('board: half', 'parts:', '  C2: capacitor/film a13 -t13 1u'));
    expect(errors).toEqual([]);
    expect(svg.slice(0, svg.indexOf('部品')).match(/>105</g)).toHaveLength(1);
  });

  test('the last heading reads 記号 and the table draws the parts as in the figure', () => {
    const { svg, errors } = renderBreadboard(source('symbols'));
    expect(errors).toEqual([]);
    const list = listOf(svg);
    expect(list).toContain('>記号<');
    expect(list).not.toContain('色・記号');
    // 抵抗とコンデンサの 2 つぶんの絵。DIP は絵を持たないので欄は空。
    expect(list.match(/class="bf-parts-icon"/g)).toHaveLength(2);
  });

  test('a microcontroller board is left out and does not stretch the rows', () => {
    const withBoard = renderBreadboard(fence('board: full', 'parts:', '  R1: resistor a30 a35 10k', '  R2: resistor b30 b35 10k', '  U1: pico2 @ h3'));
    const without = renderBreadboard(fence('board: full', 'parts:', '  R1: resistor a30 a35 10k', '  R2: resistor b30 b35 10k'));
    expect(withBoard.errors).toEqual([]);
    expect(listOf(withBoard.svg).match(/class="bf-parts-icon"/g)).toHaveLength(2);
    const height = (svg: string) => Number(/viewBox="0 0 [\d.]+ ([\d.]+)"/.exec(svg)?.[1]);
    // 表の行が 1 つ増えるだけ。行の送りが Pico 2 の高さで広がらない。
    expect(height(withBoard.svg) - height(without.svg)).toBeLessThan(60);
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

  test('drawings keep the board size (no scaling) and alternate between two columns', () => {
    const { svg } = renderBreadboard(source('symbols'));
    const placed = [...svg.matchAll(/class="bf-parts-icon" transform="translate\(([\d.]+) ([\d.]+)\)"/g)]
      .map((m) => ({ x: Number(m[1]), y: Number(m[2]) }));
    expect(placed).toHaveLength(2);
    expect(svg).not.toMatch(/class="bf-parts-icon" transform="[^"]*scale/);
    // 次の行の絵は横にずらす。
    const [first, second] = placed;
    expect(second!.x).toBeGreaterThan(first!.x);
  });

  test('the drawing shows the printed code (22p is 220) as on the board', () => {
    const icon = /<g class="bf-parts-icon"[\s\S]*$/.exec(listOf(renderBreadboard(source('symbols')).svg))?.[0] ?? '';
    expect(icon).toContain('>220<');
  });

  test('a transistor keeps its pin names (E C B) and the part captions are left out', () => {
    const { svg } = renderBreadboard(fence('board: half', 'parts:', '  Q1: transistor f5 f6 f7 2SC1815'));
    const list = listOf(svg);
    for (const name of ['E', 'C', 'B']) expect(list).toContain(`>${name}</text>`);
    expect(list).not.toContain('bf-caption');
  });

  test('diodes are marked A and K, polar capacitors + and −, on the side the fence says', () => {
    const diode = listOf(renderBreadboard(fence('board: half', 'parts:', '  D1: diode a5 a10 1N4148')).svg);
    expect(diode.indexOf('>A</text>')).toBeGreaterThan(-1);
    expect(diode.indexOf('>A</text>')).toBeLessThan(diode.indexOf('>K</text>'));
    const reversed = listOf(renderBreadboard(fence('board: half', 'parts:', '  D1: led a5(K) a10 red')).svg);
    expect(reversed.indexOf('>K</text>')).toBeLessThan(reversed.indexOf('>A</text>'));
    const polar = listOf(renderBreadboard(fence('board: half', 'parts:', '  C1: capacitor/electrolytic j5 -b5 100u')).svg);
    expect(polar).toContain('>+</text>');
    expect(polar).toContain('>−</text>');
    const film = listOf(renderBreadboard(fence('board: half', 'parts:', '  C1: capacitor/film a5 a8 100n')).svg);
    expect(film).not.toContain('>+</text>');
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
