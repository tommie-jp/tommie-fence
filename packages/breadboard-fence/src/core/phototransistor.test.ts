import { describe, expect, test } from 'vitest';
import { renderBreadboard } from './index.ts';
import { holesOf, partName, partPrefix } from './parts/catalog.ts';
import { variantsOf } from './parts/variants.ts';
import { knownPartTypes, placeableTypes } from './placement/footprints.ts';

/**
 * フォトトランジスタ (52 の docs/66 の段 6)。**2 本足** (C E。B は無い) の
 * 砲弾型で、LED と同じ姿 (`3mm` `5mm`) に黒い胴。先に書いた穴が C。
 */

const fence = (...lines: string[]): string => ['board: half', ...lines, ''].join('\n');

describe('フォトトランジスタ', () => {
  test('is a two-lead part named like the schematic', () => {
    expect(placeableTypes()).toContain('phototransistor');
    expect(knownPartTypes()).toContain('phototransistor');
    expect(holesOf('phototransistor')).toBe(2);
    expect(partName('phototransistor')).toBe('フォトトランジスタ');
    expect(partPrefix('phototransistor')).toBe('Q');
    expect(variantsOf('phototransistor')).toEqual(['3mm', '5mm']);
  });

  test('draws it and lists its legs in the netlist', () => {
    const result = renderBreadboard(fence('parts:', '  Q1: phototransistor/3mm a5 a8', 'wires:', '  - b5 -- +t5 red'));

    expect(result.errors).toEqual([]);
    expect(result.svg).toContain('#2b2f36');
    expect(result.netlist.find((net) => net.refs.includes('Q1.1'))?.name).toBe('+t');
  });
});
