import { describe, expect, test } from 'vitest';
import { DEFAULT_WIRE_COLOR, WIRE_COLORS } from 'fence-kit';
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

  test('uses the default colour when none was written', () => {
    expect(renderWires([wire('b3', 'c5')], layout, THEME)).toContain(DEFAULT_WIRE_COLOR);
  });

  test('rounds the ends, so a wire looks soldered rather than cut off', () => {
    expect(renderWires([wire('b3', 'c5')], layout, THEME)).toContain('stroke-linecap="round"');
  });

  test('draws nothing for no wires', () => {
    expect(renderWires([], layout, THEME)).toBe('');
  });

  test('draws every wire it is given', () => {
    const svg = renderWires([wire('b3', 'c5'), wire('d1', 'd4')], layout, THEME);

    expect(svg.match(/<line /g)).toHaveLength(2);
  });
});
