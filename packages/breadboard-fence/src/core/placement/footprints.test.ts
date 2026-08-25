import { describe, expect, test } from 'vitest';
import { knownPartTypes, lookupFootprint } from './footprints.ts';

describe('lookupFootprint', () => {
  test('knows the parts that sit on two leads', () => {
    for (const type of ['resistor', 'capacitor', 'led', 'diode', 'buzzer', 'crystal', 'inductor']) {
      expect(lookupFootprint(type)).toEqual({ kind: 'two-lead' });
    }
  });

  test('knows the packages that sit on three legs in a row', () => {
    for (const type of ['transistor', 'potentiometer', 'slide-switch']) {
      expect(lookupFootprint(type)).toEqual({ kind: 'three-lead' });
    }
  });

  test('knows the pushbutton as a four legged switch', () => {
    expect(lookupFootprint('pushbutton')).toEqual({ kind: 'switch' });
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

  test('reads the pin count out of a single row header name', () => {
    expect(lookupFootprint('sip4')).toEqual({ kind: 'sip', pins: 4 });
    // 片側だけなので、dip と違って奇数でよい。
    expect(lookupFootprint('sip7')).toEqual({ kind: 'sip', pins: 7 });
  });

  test('rejects a header with an unrealistic pin count', () => {
    expect(lookupFootprint('sip1')).toBeNull();
    expect(lookupFootprint('sip41')).toBeNull();
  });

  test('knows the pico series as boards with a named header', () => {
    const pico = lookupFootprint('pico2-w');

    expect(pico?.kind).toBe('board');
    expect(pico?.kind === 'board' && pico.board.name).toBe('Pico 2 W');
  });

  test('returns null for a part it cannot draw', () => {
    expect(lookupFootprint('flux-capacitor')).toBeNull();
  });

  test('lists what can be drawn so the error can name them', () => {
    expect(knownPartTypes()).toContain('pushbutton');
    expect(knownPartTypes()).toContain('sipN');
    expect(knownPartTypes()).toContain('pico2-w');
  });
});
