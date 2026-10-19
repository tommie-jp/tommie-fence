import { describe, expect, test } from 'vitest';
import { renderBreadboard } from './index.ts';
import { holesOf, PART_NAMES, PART_PREFIXES } from './parts/catalog.ts';
import { lookupFootprint } from './placement/footprints.ts';

/**
 * 巻き物 (変圧器) の足の数と、トロイダルの姿 (`/toroid`)。足の数は種類で決まり、
 * 中点タップ付きは**穴を書く順がピンの名前の順** (回路図の `transformer-ct` と同じ綴り)。
 */
const fence = (...lines: string[]): string => ['title: t', ...lines, ''].join('\n');
const messages = (result: { readonly errors: readonly { message: string }[]; readonly notices: readonly { message: string }[] }): string =>
  [...result.errors, ...result.notices].map((one) => one.message).join('\n');
const refsOf = (...lines: string[]): string[] =>
  renderBreadboard(fence(...lines)).netlist.flatMap((net) => net.refs);

describe('巻き物の足の数', () => {
  test('gives each type its lead count: 4, 5 and 6', () => {
    expect(lookupFootprint('transformer')).toEqual({ kind: 'wound', leads: 4 });
    expect(lookupFootprint('transformer-ct')).toEqual({ kind: 'wound', leads: 5 });
    expect(lookupFootprint('transformer-ct2')).toEqual({ kind: 'wound', leads: 6 });
    expect([holesOf('transformer'), holesOf('transformer-ct'), holesOf('transformer-ct2')]).toEqual([4, 5, 6]);
  });

  test('has a name and a prefix for the tapped types', () => {
    expect(PART_NAMES['transformer-ct']).toContain('中点');
    expect(PART_NAMES['transformer-ct2']).toContain('中点');
    expect(PART_PREFIXES['transformer-ct']).toBe('T');
    expect(PART_PREFIXES['transformer-ct2']).toBe('T');
  });

  test('names the pins of a centre-tapped transformer in the order the holes are written', () => {
    const refs = refsOf(
      'parts:', '  T1: transformer-ct2 d10 d12 d14 h10 h12 h14',
      'wires:', '  - a10 -- d10', '  - a12 -- d12', '  - a14 -- d14', '  - j10 -- h10', '  - j12 -- h12', '  - j14 -- h14',
    );

    expect(refs).toEqual(expect.arrayContaining(['T1.A1', 'T1.ACT', 'T1.A2', 'T1.B1', 'T1.BCT', 'T1.B2']));
  });

  test('names a five-lead one with the tap on the secondary only', () => {
    const refs = refsOf(
      'parts:', '  T1: transformer-ct d10 d12 h10 h12 h14',
      'wires:', '  - a10 -- d10', '  - a12 -- d12', '  - j10 -- h10', '  - j12 -- h12', '  - j14 -- h14',
    );

    expect(refs).toEqual(expect.arrayContaining(['T1.A1', 'T1.A2', 'T1.B1', 'T1.CT', 'T1.B2']));
    expect(refs).not.toContain('T1.ACT');
  });

  test('keeps the numbered pins of the plain four-lead transformer', () => {
    const refs = refsOf(
      'parts:', '  T1: transformer d10 d12 h10 h12',
      'wires:', '  - a10 -- d10', '  - a12 -- d12', '  - j10 -- h10', '  - j12 -- h12',
    );

    expect(refs).toEqual(expect.arrayContaining(['T1.1', 'T1.2', 'T1.3', 'T1.4']));
  });

  test('refuses the wrong number of holes and says how many to write', () => {
    const result = renderBreadboard(fence('parts:', '  T1: transformer-ct2 d10 d12 h10 h12'));

    expect(result.errors.map((one) => one.message).join('\n')).toContain('穴番地を 6 つ書きます');
  });
});

describe('トロイダルの姿', () => {
  const svg = (line: string): string => renderBreadboard(fence('parts:', line)).svg;

  test('draws a ring with a hole instead of the laminated block', () => {
    expect(svg('  T1: transformer/toroid d10 d12 h10 h12 FT37-43')).toContain('fill-rule="evenodd"');
    expect(svg('  T1: transformer d10 d12 h10 h12')).not.toContain('fill-rule="evenodd"');
  });

  test('colours the ring by the model: iron powder red, ferrite grey', () => {
    expect(svg('  T1: transformer/toroid d10 d12 h10 h12 T37-2')).toContain('#b8382c');
    expect(svg('  T1: transformer/toroid d10 d12 h10 h12 FT37-61')).toContain('#5d5a52');
  });

  test('takes the toroid look on a coil and on a tapped transformer too', () => {
    expect(svg('  L1: inductor/toroid b3 b8 4u7')).toContain('fill-rule="evenodd"');
    expect(svg('  T1: transformer-ct/toroid d10 d12 h10 h12 h14 FT37-43')).toContain('fill-rule="evenodd"');
  });

  test('refuses a look the part does not have', () => {
    const result = renderBreadboard(fence('parts:', '  T1: transformer/ring d10 d12 h10 h12'));

    expect(result.errors.map((one) => one.message).join('\n')).toContain('toroid');
  });
});

describe('トロイダルの L の目安 (お知らせ)', () => {
  const said = (...lines: string[]): string => messages(renderBreadboard(fence('parts:', ...lines)));

  test('says the inductance of a coil written as model + turns', () => {
    const text = said('  L1: inductor/toroid b3 b8 FT37-43 10t');

    expect(text).toContain('L1:');
    expect(text).toContain('10 回で約 35 µH');
    expect(text).toContain('AL 350');
  });

  test('says primary and secondary for a transformer written as primary:secondary', () => {
    const text = said('  T1: transformer/toroid d2 d4 h2 h4 FT37-43 10t:20t');

    expect(text).toContain('1 次 10 回で約 35 µH');
    expect(text).toContain('2 次 20 回で約 140 µH');
  });

  test('says nothing when only the model is written, or the value is an inductance', () => {
    expect(said('  T1: transformer/toroid d2 d4 h2 h4 FT37-43')).not.toContain('µH');
    expect(said('  L1: inductor/toroid b3 b8 4u7')).not.toContain('AL');
  });

  test('reports turns it cannot read and says how to write them', () => {
    expect(said('  L1: inductor/toroid b3 b8 FT37-43 10')).toContain('10t');
  });

  test('says nothing for the plain look, even with a model and turns written', () => {
    expect(said('  T1: transformer d2 d4 h2 h4 FT37-43 10t')).not.toContain('µH');
  });
});
