import { describe, expect, test } from 'vitest';
import { axisLabel, axisUnit, parseFrequency, parseTime } from './time.ts';

describe('parseTime', () => {
  test('reads a time with its unit', () => {
    expect(parseTime('1s')).toBe(1);
    expect(parseTime('500ms')).toBeCloseTo(0.5);
    expect(parseTime('-2ms')).toBeCloseTo(-0.002);
  });

  test('reads a bare 0 but refuses any other bare number', () => {
    expect(parseTime('0')).toBe(0);
    expect(parseTime('1')).toBeNull();
  });
});

describe('parseFrequency', () => {
  test('needs a unit or a prefix', () => {
    expect(parseFrequency('1Hz')).toBe(1);
    expect(parseFrequency('100kHz')).toBe(100e3);
    expect(parseFrequency('12M')).toBe(12e6);
    expect(parseFrequency('1000')).toBeNull();
  });
});

describe('axis labels', () => {
  test('picks the largest unit that keeps a division at 1 or more', () => {
    expect(axisUnit(1)[0]).toBe('s');
    expect(axisUnit(0.001)[0]).toBe('ms');
    expect(axisUnit(20e-6)[0]).toBe('µs');
    expect(axisUnit(50e-9)[0]).toBe('ns');
  });

  test('writes every tick of a figure in one unit', () => {
    const unit = axisUnit(0.0005);
    expect(axisLabel(0, unit)).toBe('0 µs');
    expect(axisLabel(0.0015, unit)).toBe('1500 µs');
    const ms = axisUnit(0.002);
    expect(axisLabel(0.0015, ms)).toBe('1.5 ms');
  });
});
