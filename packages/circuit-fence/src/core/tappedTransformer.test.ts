import { describe, expect, test } from 'vitest';
import { compileCircuit } from './index.ts';

/**
 * 中点タップ付きのトランス。circuitikz 1.0 に記号が無いので、自前の形を宣言して使う。
 * ピンは巻線の端 1・(中点)・端 2 の順で、1 次が左・2 次が右。
 */
const circuit = (...lines: string[]): string => ['parts:', ...lines].join('\n');

describe('transformer-ct / transformer-ct2', () => {
  test('declares its own shape only when the part is used', async () => {
    const used = await compileCircuit(circuit('  T1: transformer-ct 6,5', '  T2: transformer-ct2 12,5'));
    const unused = await compileCircuit(circuit('  T1: transformer 6,5'));

    expect(used.tex).toContain('\\pgfdeclareshape{xfmrct}');
    expect(used.tex).toContain('\\pgfdeclareshape{xfmrct2}');
    expect(unused.tex).not.toContain('xfmrct');
  });

  test('wires the centre tap by name and reads it back in the netlist', async () => {
    const result = await compileCircuit(circuit(
      '  T1: transformer-ct2 6,5', '  G1: ground 9,8', '  G2: ground 3,8',
      'wires:', '  - T1.BCT -- 9,5', '  - 9,5 -- 9,8', '  - T1.ACT -- 3,5', '  - 3,5 -- 3,8',
    ));

    expect(result.errors).toEqual([]);
    expect(result.netlist.flatMap((net) => net.refs)).toEqual(expect.arrayContaining(['T1.ACT', 'T1.BCT']));
  });

  test('has no primary tap on transformer-ct, and says which pins it has', async () => {
    const result = await compileCircuit(circuit('  T1: transformer-ct 6,5', 'wires:', '  - T1.ACT -- 3,5'));

    expect(result.errors.map((one) => one.message).join('\n')).toMatch(/ACT.*(はありません)|ピン/);
  });
});
