import { describe, expect, test } from 'vitest';
import {
  formatDegrees, formatHertzReading, formatPercent, formatPerDiv, formatSeconds, formatVolts,
  parseDegrees, parsePerDiv, parsePercent, parseSeconds, parseVolts,
} from './units.ts';

describe('parseVolts', () => {
  test.each([
    ['1V', 1, 'peak'],
    ['500mV', 0.5, 'peak'],
    ['-0.7V', -0.7, 'peak'],
    ['2Vpp', 2, 'pp'],
    ['0.707Vrms', 0.707, 'rms'],
    ['4.3V', 4.3, 'peak'],
    ['100uV', 1e-4, 'peak'],
    ['100µV', 1e-4, 'peak'],
    ['1kV', 1000, 'peak'],
    ['.5V', 0.5, 'peak'],
    ['0V', 0, 'peak'],
  ])('reads %s', (text, volts, kind) => {
    const read = parseVolts(text);
    expect(read?.kind).toBe(kind);
    expect(read?.volts).toBeCloseTo(volts, 12);
  });

  test('reads dBm as the power of a sine into 50 ohms, given back as the peak', () => {
    const read = parseVolts('-10dBm');
    expect(read?.kind).toBe('dBm');
    expect(read?.volts).toBeCloseTo(0.1, 6);
    expect(parseVolts('0dBm')?.volts).toBeCloseTo(0.3162, 4);
  });

  // 単位の無い数は断る (AI が `1` と書いて 1 V のつもりかどうかを道具が決めない)。
  test.each(['1', '0.5', '', 'V', '1 volt', '1v', '1mv', '1Vp', '1e3V', '--1V'])('refuses %s', (text) => {
    expect(parseVolts(text)).toBeNull();
  });
});

describe('parseSeconds', () => {
  test.each([
    ['1ms', 1e-3],
    ['200us', 200e-6],
    ['200µs', 200e-6],
    ['200μs', 200e-6],
    ['1s', 1],
    ['1min', 60],
    ['10ns', 10e-9],
    ['0', 0],
    ['-1ms', -1e-3],
    ['2.5 ms', 2.5e-3],
  ])('reads %s', (text, seconds) => {
    expect(parseSeconds(text)).toBeCloseTo(seconds, 15);
  });

  test.each(['1', '1m', '1 sec', 'ms', '1msec', '00', ''])('refuses %s', (text) => {
    expect(parseSeconds(text)).toBeNull();
  });
});

describe('parseDegrees / parsePercent', () => {
  test('reads degrees in three spellings', () => {
    expect(parseDegrees('-58deg')).toBe(-58);
    expect(parseDegrees('90°')).toBe(90);
    expect(parseDegrees('45 deg')).toBe(45);
    expect(parseDegrees('45')).toBeNull();
    expect(parseDegrees('1rad')).toBeNull();
  });

  test('reads a percentage strictly between 0 and 100', () => {
    expect(parsePercent('25%')).toBe(0.25);
    expect(parsePercent('50 %')).toBe(0.5);
    expect(parsePercent('0%')).toBeNull();
    expect(parsePercent('100%')).toBeNull();
    expect(parsePercent('0.25')).toBeNull();
  });
});

describe('parsePerDiv', () => {
  test('reads a setting per division', () => {
    expect(parsePerDiv('500mV/div', 'V')).toBe(0.5);
    expect(parsePerDiv('2V/div', 'V')).toBe(2);
    expect(parsePerDiv('1ms/div', 's')).toBe(1e-3);
    expect(parsePerDiv('200us / div', 's')).toBeCloseTo(200e-6, 15);
  });

  test('refuses a value without /div, the wrong unit, zero or a negative', () => {
    expect(parsePerDiv('1ms', 's')).toBeNull();
    expect(parsePerDiv('500mV', 'V')).toBeNull();
    expect(parsePerDiv('1ms/div', 'V')).toBeNull();
    expect(parsePerDiv('1V/div', 's')).toBeNull();
    expect(parsePerDiv('0V/div', 'V')).toBeNull();
    expect(parsePerDiv('-1V/div', 'V')).toBeNull();
    expect(parsePerDiv('2Vpp/div', 'V')).toBeNull();
  });
});

describe('format', () => {
  test('writes volts with three significant digits, the way the Measurements do', () => {
    expect(formatVolts(2)).toBe('2.00 V');
    expect(formatVolts(1.2612)).toBe('1.26 V');
    expect(formatVolts(9.3)).toBe('9.30 V');
    expect(formatVolts(12)).toBe('12.0 V');
    expect(formatVolts(0.7)).toBe('700 mV');
    expect(formatVolts(-0.7)).toBe('-700 mV');
    expect(formatVolts(0.0131)).toBe('13.1 mV');
    expect(formatVolts(0.0091)).toBe('9.10 mV');
    expect(formatVolts(0)).toBe('0 V');
    expect(formatVolts(0.9996)).toBe('1.00 V');
    expect(formatVolts(5e-7)).toBe('500 nV');
  });

  test('writes seconds with four significant digits', () => {
    expect(formatSeconds(1e-3)).toBe('1.000 ms');
    expect(formatSeconds(161.11e-6)).toBe('161.1 µs');
    expect(formatSeconds(0)).toBe('0 s');
    expect(formatSeconds(2.2e-3)).toBe('2.200 ms');
    expect(formatSeconds(-5e-4)).toBe('-500.0 µs');
    expect(formatSeconds(90)).toBe('90.00 s');
  });

  test('writes frequency with four significant digits', () => {
    expect(formatHertzReading(100)).toBe('100.0 Hz');
    expect(formatHertzReading(1000)).toBe('1.000 kHz');
    expect(formatHertzReading(999.99)).toBe('1.000 kHz');
    expect(formatHertzReading(12.5e6)).toBe('12.50 MHz');
  });

  test('writes degrees, percent and per-division settings', () => {
    expect(formatDegrees(-58.04)).toBe('-58.0°');
    expect(formatPercent(0.5)).toBe('50.0 %');
    expect(formatPerDiv(0.5, 'V')).toBe('500mV/div');
    expect(formatPerDiv(2, 'V')).toBe('2V/div');
    expect(formatPerDiv(200e-6, 's')).toBe('200µs/div');
    expect(formatPerDiv(1e-3, 's')).toBe('1ms/div');
    expect(formatPerDiv(20, 's')).toBe('20s/div');
  });
});
