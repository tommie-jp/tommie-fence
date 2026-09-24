import { describe, expect, test } from 'vitest';
import { renderPerfboard } from './index.ts';
import { holesOf, partName, partPrefix } from './parts/catalog.ts';
import { isKnownType, placeableNames, splitPartType } from './parts/types.ts';

/**
 * 3 本足の IC (`ic3`。52 の docs/66 の段 7)。置き方はトランジスタと同じ 3 つの穴で、
 * 姿は `to92` (既定) と `to220`。
 */

const fence = (...lines: string[]): string => ['board: 20x10', ...lines, ''].join('\n');

describe('3 本足の IC', () => {
  test('is a three-lead part named like the schematic', () => {
    expect(isKnownType('ic3')).toBe(true);
    expect(placeableNames()).toContain('ic3');
    expect(holesOf('ic3')).toBe(3);
    expect(partName('ic3')).toBe('3 本足の IC');
    expect(partPrefix('ic3')).toBe('U');
    expect(splitPartType('ic3/to220').problem).toBeNull();
    expect(splitPartType('ic3/3mm').problem).not.toBeNull();
  });

  test('draws it and lists its legs', () => {
    const result = renderPerfboard(fence(
      'parts:', '  U1: ic3 c3 c4 c5 LM35', 'wires:', '  - c3 -- a3', '  - c4 -- e4', '  - c5 -- a5',
    ));

    expect(result.errors.filter((one) => !one.message.includes('つながっていません'))).toEqual([]);
    expect(result.netlist.flatMap((net) => net.refs)).toEqual(expect.arrayContaining(['U1.1', 'U1.2', 'U1.3']));
  });
});
