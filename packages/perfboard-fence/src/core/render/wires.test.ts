import { describe, expect, test } from 'vitest';
import { WIRE_COLORS } from 'fence-kit';
import { THEME } from './theme.ts';
import { renderWires } from './wires.ts';
import { createBoard } from '../model/board.ts';
import { createLayout } from '../model/layout.ts';
import { parseAddress } from '../model/address.ts';
import type { RoutedWire } from '../types.ts';

const layout = createLayout(createBoard({ cols: 10, rows: 6 }));

const wire = (from: string, to: string, color: string | null = null): RoutedWire =>
  ({ from: parseAddress(from)!, to: parseAddress(to)!, color, line: null });

describe('renderWires', () => {
  test('runs a straight line from hole to hole', () => {
    // ユニバーサル基板のジャンパは 2 点をまっすぐ結ぶ。ブレッドボードのように
    // 横レーンへ迂回する必要が無い (溝もレールも無く、どの穴も同じ格子の上)。
    const svg = renderWires([wire('b3', 'c5')], layout, THEME);
    const from = layout.point(parseAddress('b3')!);
    const to = layout.point(parseAddress('c5')!);

    expect(svg).toContain(`x1="${from.x}"`);
    expect(svg).toContain(`y2="${to.y}"`);
  });

  test('paints the colour that was written', () => {
    expect(renderWires([wire('b3', 'c5', 'red')], layout, THEME)).toContain(WIRE_COLORS.red as string);
  });

  test('uses the colour the board asks for when none was written', () => {
    // 既定は基板の色から決まる (fence-kit の一律の灰色ではない)。
    expect(renderWires([wire('b3', 'c5')], layout, THEME)).toContain(THEME.palette.wire);
  });

  test('rounds the ends, so a wire looks soldered rather than cut off', () => {
    expect(renderWires([wire('b3', 'c5')], layout, THEME)).toContain('stroke-linecap="round"');
  });

  test('draws nothing for no wires', () => {
    expect(renderWires([], layout, THEME)).toBe('');
  });

  test('draws every wire it is given', () => {
    const svg = renderWires([wire('b3', 'c5'), wire('d1', 'd4')], layout, THEME);

    expect(svg.match(/<line /g)).toHaveLength(4); // 縁 2 本 + 線 2 本
  });
});

describe('色を書かなかった配線', () => {
  // 基板の色が変われば既定の線の色も変わる (`render/finish.ts` の `wireOn`)。
  const onBoard = { ...THEME, palette: { ...THEME.palette, wire: '#123456' } };

  test('takes the colour the board asks for, not a fixed grey', () => {
    expect(renderWires([wire('b3', 'c5')], layout, onBoard)).toContain('#123456');
  });

  test('still draws a written colour as written, however the board looks', () => {
    expect(renderWires([wire('b3', 'c5', 'red')], layout, onBoard)).not.toContain('#123456');
  });
});

describe('跨ぎの大きさと向き', () => {
  const hole = (address: string) => layout.point(parseAddress(address)!);
  const between = (one: string, other: string) => {
    const a = hole(one);
    const b = hole(other);
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  };

  test('hops wide over a hole, so the arc clears the land and the solder', () => {
    const svg = renderWires([wire('a5', 'e5')], layout, THEME, [[hole('c5')]]);

    expect(svg).toContain('A 9 9 ');
  });

  test('hops small between holes, where a wide arc would touch the neighbours', () => {
    const svg = renderWires([wire('a5', 'e5')], layout, THEME, [[between('c5', 'c6')]]);

    expect(svg).toContain('A 5 5 ');
  });

  test('bulges the same way however the wire was written', () => {
    // 縦の線は右へ、横の線は上へ。書いた端の順で膨らむ側が変わらない。
    const sweeps = (from: string, to: string, at: string) =>
      renderWires([wire(from, to)], layout, THEME, [[hole(at)]]).match(/ 0 0 ([01]) /)?.[1];

    expect(sweeps('a5', 'e5', 'c5')).toBe('1');
    expect(sweeps('e5', 'a5', 'c5')).toBe('0');
    expect(sweeps('c2', 'c8', 'c5')).toBe('1');
    expect(sweeps('c8', 'c2', 'c5')).toBe('0');
  });
});

describe('wire outline (52 の docs/110)', () => {
  test('lays every outline before any wire', () => {
    const svg = renderWires([wire('b3', 'c5', 'blue'), wire('d1', 'd4', 'red')], layout, THEME);
    const outlines = [...svg.matchAll(/cf-wire-outline/g)].map((m) => m.index);
    const firstLine = svg.indexOf(WIRE_COLORS.blue as string);
    expect(outlines).toHaveLength(2);
    expect(Math.max(...outlines)).toBeLessThan(firstLine);
  });

  test('draws a coloured wire 4 wide over a 6-wide white outline, and a white wire over a dark one', () => {
    const svg = renderWires([wire('b3', 'c5', 'blue')], layout, THEME);
    expect(svg).toContain('stroke="#ffffff" stroke-width="6"');
    expect(renderWires([wire('b3', 'c5', 'white')], layout, THEME)).toContain('stroke="#1b1d21" stroke-width="6"');
    expect(svg).toMatch(/stroke="#2b6fd4" stroke-width="4"/);
    expect(svg).toContain('stroke-opacity="1"');
  });

  test('uses a light outline on a black board', () => {
    const black = { ...THEME, palette: { ...THEME.palette, plate: '#26292c' } };
    expect(renderWires([wire('b3', 'c5')], layout, black)).toContain('stroke="#e6ebef" stroke-width="6"');
  });

  test('leaves hatched (black-and-white) figures unoutlined', () => {
    expect(renderWires([wire('b3', 'c5', 'red')], layout, { ...THEME, hatch: true })).not.toContain('cf-wire-outline');
  });
});
