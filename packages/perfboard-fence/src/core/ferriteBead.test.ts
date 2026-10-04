import { describe, expect, test } from 'vitest';
import { renderPerfboard } from './index.ts';
import { PART_NAMES, PART_PREFIXES } from './parts/catalog.ts';
import { isAxial, isTwoLead } from './parts/types.ts';

/**
 * フェライトビーズ (リード付きの軸物)。**2 ピンで、ピンの間隔は抵抗と同じ規則**
 * (隣の穴には入らない)。値は型番や `600R@100M` のような書き方をそのまま受ける。
 */
const fence = (...lines: string[]): string => ['board: 20x10', ...lines, ''].join('\n');
const messages = (result: { readonly errors: readonly { message: string }[]; readonly notices: readonly { message: string }[] }): string =>
  [...result.errors, ...result.notices].map((one) => one.message).join('\n');

describe('フェライトビーズ', () => {
  test('is a two-lead axial part with a name and a prefix', () => {
    expect(isTwoLead('ferrite-bead')).toBe(true);
    expect(isAxial('ferrite-bead')).toBe(true);
    expect(PART_NAMES['ferrite-bead']).toBe('フェライトビーズ');
    expect(PART_PREFIXES['ferrite-bead']).toBe('FB');
  });

  test('draws, joins the netlist and takes a value written as impedance at a frequency', () => {
    const result = renderPerfboard(fence(
      'parts:', '  FB1: ferrite-bead b2 b6 600R@100M', 'wires:', '  - b2 -- a2', '  - b6 -- a6',
    ));

    expect(result.errors).toEqual([]);
    expect(result.svg).toContain('FB1 600R@100M');
    expect(result.netlist.flatMap((net) => net.refs)).toEqual(expect.arrayContaining(['FB1.1', 'FB1.2']));
  });

  test('refuses neighbouring holes, like a resistor', () => {
    const result = renderPerfboard(fence('parts:', '  FB1: ferrite-bead b2 b3 100n'));

    expect(messages(result)).toContain('狭すぎます');
  });

  test('draws a body that is neither the coil nor the resistor', () => {
    const bead = renderPerfboard(fence('parts:', '  X1: ferrite-bead b2 b6')).svg;
    const coil = renderPerfboard(fence('parts:', '  X1: inductor b2 b6')).svg;

    expect(bead).not.toBe(coil);
  });
});
