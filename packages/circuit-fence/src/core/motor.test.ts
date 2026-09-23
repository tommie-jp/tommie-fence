import { describe, expect, test } from 'vitest';
import { compileCircuit } from './index.ts';
import { PART_NAMES, PART_PREFIXES, lookupPartType } from './parts.ts';

/**
 * モータ (52 の docs/66 の段 2)。**丸に M** の 2 端子。circuitikz 1.0 には
 * モータの記号 (`elmech`) が無く、書いても素の線だけを描く (実機で確かめた) ので、
 * 計器と同じ「丸に字」の記号で描く。板の 2 つは線でつなぐ物として `device` で書く。
 */

const circuit = (...rows: string[]): string => [...rows, ''].join('\n');

describe('モータ', () => {
  test('is a two-terminal part named M', () => {
    expect(lookupPartType('motor')?.kind).toBe('two-terminal');
    expect(PART_NAMES.motor).toBe('モータ');
    expect(PART_PREFIXES.motor).toBe('M');
  });

  test('draws a circle with M in it and connects both ends', () => {
    const result = compileCircuit(circuit(
      'parts:',
      '  M1: motor a3 c3',
      '  B1: battery a1 c1 3',
      'wires:',
      '  - a1 -- a3',
      '  - c1 -- c3',
    ));

    expect(result.errors).toEqual([]);
    expect(result.tex).toMatch(/to\[rmeter, t=\{\$\\mathrm\{M\}\$\}/);
    expect(result.netlist.find((net) => net.refs.includes('M1.1'))?.refs).toContain('B1.1');
  });
});
