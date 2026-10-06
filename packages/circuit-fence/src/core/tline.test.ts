import { describe, expect, test } from 'vitest';
import { compileCircuit } from './index.ts';
import { PART_NAMES, PART_PREFIXES, lookupPartType } from './parts.ts';

/**
 * 伝送線路 (52 の docs/74)。circuitikz の `TL` (円筒)。値は特性インピーダンスで Ω を補う。
 * 銅張り基板 (copper) の図の等価回路で、マイクロストリップを 1 本の線路として描く。
 */
describe('伝送線路', () => {
  test('is a two-terminal part named TL', () => {
    expect(lookupPartType('tline')?.kind).toBe('two-terminal');
    expect(PART_NAMES.tline).toBe('伝送線路');
    expect(PART_PREFIXES.tline).toBe('TL');
  });

  test('draws the TL symbol with its impedance in ohms', () => {
    const result = compileCircuit(['parts:', '  TL1: tline 1,1 5,1 50', '  R1: resistor 1,3 5,3 50', 'wires:', '  - 5,1 -- 5,3', ''].join('\n'));

    expect(result.errors).toEqual([]);
    expect(result.tex).toMatch(/to\[TL[,\]]/);
    expect(result.tex).toMatch(/50\s*\\?\\?(?:,)?.*(?:Omega|ohm)/);
  });
});
