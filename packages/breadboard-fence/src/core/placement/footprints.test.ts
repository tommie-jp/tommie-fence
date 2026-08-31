import { describe, expect, test } from 'vitest';
import { describeUnknownType, knownPartTypes, lookupFootprint } from './footprints.ts';

describe('lookupFootprint', () => {
  test('knows the parts that sit on two leads', () => {
    for (const type of ['resistor', 'capacitor', 'led', 'diode', 'buzzer', 'crystal', 'inductor']) {
      expect(lookupFootprint(type)).toEqual({ kind: 'two-lead' });
    }
  });

  test('knows the sensors that sit on two leads', () => {
    for (const type of ['photoresistor', 'thermistor', 'thermistor-ntc', 'thermistor-ptc', 'varistor']) {
      expect(lookupFootprint(type)).toEqual({ kind: 'two-lead' });
    }
  });

  test('knows the diode family circuit-fence names', () => {
    for (const type of ['zener', 'schottky', 'photodiode', 'varicap', 'diac']) {
      expect(lookupFootprint(type)).toEqual({ kind: 'two-lead' });
    }
  });

  test('knows the parts sealed in a glass envelope', () => {
    for (const type of ['reed', 'fuse', 'lamp']) {
      expect(lookupFootprint(type)).toEqual({ kind: 'two-lead' });
    }
  });

  test('knows the packages that sit on three legs in a row', () => {
    for (const type of ['transistor', 'potentiometer', 'slide-switch', 'thyristor', 'triac']) {
      expect(lookupFootprint(type)).toEqual({ kind: 'three-lead' });
    }
  });

  test('knows the button as a four legged switch', () => {
    expect(lookupFootprint('button')).toEqual({ kind: 'switch' });
  });

  test('no longer knows the 0.2.0 spelling as a type of its own', () => {
    // pushbutton は略記に落としたので、パーサが button に畳んでからここへ来る。
    expect(lookupFootprint('pushbutton')).toBeNull();
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
    expect(knownPartTypes()).toContain('button');
    expect(knownPartTypes()).toContain('sipN');
    expect(knownPartTypes()).toContain('pico2-w');
  });
});

describe('describeUnknownType', () => {
  test('offers the nearest name when the type is only misspelled', () => {
    expect(describeUnknownType('resistr')).toContain('resistor のことですか');
    expect(describeUnknownType('capaciter')).toContain('capacitor のことですか');
  });

  test('offers a shorthand too, since typing it also works', () => {
    expect(describeUnknownType('pushbuton')).toContain('pushbutton のことですか');
  });

  test('says what a dip pin count has to be, instead of guessing a name', () => {
    // dip9 に「dipN のことですか」と返しても直す手がかりにならない。
    expect(describeUnknownType('dip9')).toContain('4〜40 の偶数');
    expect(describeUnknownType('dip64')).toContain('4〜40 の偶数');
    expect(describeUnknownType('sip41')).toContain('2〜40');
  });

  test('falls back to listing what can be drawn when nothing is close', () => {
    const message = describeUnknownType('flux-capacitor');

    expect(message).toContain('resistor');
    expect(message).toContain('dipN');
  });

  test('does not offer a name that shares nothing with what was written', () => {
    expect(describeUnknownType('x')).not.toContain('ことですか');
  });
});
