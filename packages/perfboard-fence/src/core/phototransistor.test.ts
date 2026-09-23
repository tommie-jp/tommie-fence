import { describe, expect, test } from 'vitest';
import { renderPerfboard } from './index.ts';
import { holesOf, partName, partPrefix } from './parts/catalog.ts';
import { isAxial, isKnownType, placeableNames, splitPartType } from './parts/types.ts';

/**
 * フォトトランジスタ (52 の docs/66 の段 6)。**2 本足** (C E。B は無い) の
 * 砲弾型で、LED と同じ姿 (`3mm` `5mm`) に黒い胴。先に書いた穴が C。
 */

const fence = (...lines: string[]): string => ['board: 20x10', ...lines, ''].join('\n');

describe('フォトトランジスタ', () => {
  test('is a two-lead radial part named like the schematic', () => {
    expect(isKnownType('phototransistor')).toBe(true);
    expect(placeableNames()).toContain('phototransistor');
    expect(holesOf('phototransistor')).toBe(2);
    // 砲弾型は足が同じ側から出る (軸物ではない)。隣の穴に挿せる。
    expect(isAxial('phototransistor')).toBe(false);
    expect(partName('phototransistor')).toBe('フォトトランジスタ');
    expect(partPrefix('phototransistor')).toBe('Q');
    expect(splitPartType('phototransistor/3mm').problem).toBeNull();
    expect(splitPartType('phototransistor/to92').problem).not.toBeNull();
  });

  test('draws it with the dark dome', () => {
    const result = renderPerfboard(fence('parts:', '  Q1: phototransistor b5 b6', 'wires:', '  - b5 -- b2', '  - b6 -- b9'));

    expect(result.errors.filter((one) => !one.message.includes('つながっていません'))).toEqual([]);
    expect(result.svg).toContain('#2b2f36');
  });
});
