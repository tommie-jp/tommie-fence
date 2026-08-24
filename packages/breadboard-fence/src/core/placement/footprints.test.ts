import { describe, expect, test } from 'vitest';
import { lookupFootprint } from './footprints.ts';

describe('lookupFootprint', () => {
  test('knows the parts that sit on two leads', () => {
    for (const type of ['resistor', 'capacitor', 'led']) {
      expect(lookupFootprint(type)).toEqual({ kind: 'two-lead' });
    }
  });

  test('knows the transistor as a three lead package', () => {
    expect(lookupFootprint('transistor')).toEqual({ kind: 'three-lead' });
  });

  test('reads the pin count out of a dip package name', () => {
    expect(lookupFootprint('dip8')).toEqual({ kind: 'dip', pins: 8 });
    expect(lookupFootprint('dip14')).toEqual({ kind: 'dip', pins: 14 });
  });

  test('rejects a dip with an odd or unrealistic pin count', () => {
    expect(lookupFootprint('dip7')).toBeNull();
    expect(lookupFootprint('dip2')).toBeNull();
    expect(lookupFootprint('dip64')).toBeNull();
  });

  test('returns null for a part it cannot draw', () => {
    expect(lookupFootprint('flux-capacitor')).toBeNull();
  });
});
