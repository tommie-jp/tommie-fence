import { describe, expect, test } from 'vitest';
import { compileCircuit } from './index.ts';
import { PART_NAMES, PART_PREFIXES, lookupPartType, lookupPin } from './parts.ts';

/** Tang Nano 9K。足の名前は実体配線図の 2 つと同じ表 (fence-kit)。 */
describe('Tang Nano 9K', () => {
  test('is a 48-pin box named by the table of the boards', () => {
    const type = lookupPartType('tang-nano-9k')!;

    expect(PART_NAMES['tang-nano-9k']).toBe('Tang Nano 9K');
    expect(PART_PREFIXES['tang-nano-9k']).toBe('U');
    expect(lookupPin(type, 'IO38')).not.toBeNull();
    expect(lookupPin(type, '3V3')).not.toBeNull();
    expect(lookupPin(type, 'IO1')).toBeNull();
  });

  test('writes the chip name in the box and wires a leg by its name', () => {
    const result = compileCircuit([
      'parts:', '  U1: tang-nano-9k d5', '  R1: resistor a9 a11 330', 'wires:', '  - U1.IO25 -| a9', '',
    ].join('\n'));

    expect(result.errors).toEqual([]);
    expect(result.tex).toContain('num pins=48');
    expect(result.tex).toContain('GW1NR');
    expect(result.netlist.find((net) => net.refs.includes('R1.1'))?.refs).toContain('U1.IO25');
  });
});
