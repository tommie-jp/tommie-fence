import { describe, expect, test } from 'vitest';
import { renderPerfboard } from './index.ts';
import { footprintOf, pinsOf } from './parts/footprint.ts';
import { holesOf, partName, partPrefix } from './parts/catalog.ts';
import { isKnownType, placeableNames } from './parts/types.ts';

/** Tang Nano 9K。DIP と同じ並べ方で、2 列の間隔は 9 穴 (Pico は 7 穴)。 */
const at = (row: number, col: number) => ({ row, col });

describe('Tang Nano 9K', () => {
  test('is a board of 48 pins placed from one hole', () => {
    expect(isKnownType('tang-nano-9k')).toBe(true);
    expect(placeableNames()).toContain('tang-nano-9k');
    expect(holesOf('tang-nano-9k')).toBe(1);
    expect(partName('tang-nano-9k')).toBe('Tang Nano 9K');
    expect(partPrefix('tang-nano-9k')).toBe('U');
    expect(footprintOf('tang-nano-9k')).toMatchObject({ kind: 'board', pins: 48, holes: 1, span: 9 });
  });

  test('puts pin 1 at the lower left and pin 48 back above it, nine holes apart', () => {
    const pins = pinsOf(footprintOf('tang-nano-9k')!, [at(2, 3)]);

    expect(pins).toHaveLength(48);
    expect([pins[0], pins[23], pins[24], pins[47]]).toEqual([at(11, 3), at(11, 26), at(2, 26), at(2, 3)]);
  });

  test('keeps the pico at seven holes', () => {
    expect(pinsOf(footprintOf('pico2')!, [at(2, 3)])[0]).toEqual(at(9, 3));
  });

  test('draws the board and names the legs in the netlist', () => {
    const { errors, svg, netlist } = renderPerfboard([
      'board: 40x20', 'parts:', '  U1: tang-nano-9k c3', '',
    ].join('\n'));

    expect(errors).toEqual([]);
    expect(svg).toContain('GW1NR-9');
    expect(netlist.flatMap((net) => net.refs)).toContain('U1.IO38');
  });
});
