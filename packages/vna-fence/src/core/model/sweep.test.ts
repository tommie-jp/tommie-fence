import { describe, expect, test } from 'vitest';
import { rangeNotice } from './device.ts';
import { DEFAULT_POINTS, deviceSweep, frequenciesOf, parseSweep } from './sweep.ts';

describe('parseSweep', () => {
  test('reads start-stop and points', () => {
    expect(parseSweep('1M-300M 101')).toEqual({ ok: true, sweep: { start: 1e6, stop: 300e6, points: 101 } });
  });

  test('takes 101 points when they are left out', () => {
    const read = parseSweep('50k-1.5G');
    expect(read.ok && read.sweep.points).toBe(DEFAULT_POINTS);
  });

  test.each([
    ['300M-1M', '上にします'],
    ['1M-300M 1002', '2〜1001'],
    ['1M-300M 1', '2〜1001'],
    ['1M-300M 10.5', '整数'],
    ['1M', 'sweep:'],
    ['1M-2M-3M', 'sweep:'],
    ['1M-20G', '10 GHz'],
    ['a-b', 'sweep:'],
    ['1M-300M 101 x', 'sweep:'],
  ])('refuses %s', (text, said) => {
    const read = parseSweep(text);
    expect(read.ok).toBe(false);
    expect(!read.ok && read.reason).toContain(said);
  });
});

describe('frequenciesOf', () => {
  test('spreads the points evenly and ends exactly on the stop', () => {
    const list = frequenciesOf({ start: 1e6, stop: 300e6, points: 101 });
    expect(list).toHaveLength(101);
    expect(list[0]).toBe(1e6);
    expect(list[1]).toBeCloseTo(3.99e6, 0);
    expect(list[100]).toBe(300e6);
  });
});

describe('devices', () => {
  test('the default sweep is the whole range of the device', () => {
    expect(deviceSweep('h4')).toEqual({ start: 50e3, stop: 1.5e9, points: 101 });
  });

  test('says when a sweep goes past what the device measures', () => {
    expect(rangeNotice('h4', 1e6, 3e9)).toBe('NanoVNA-H4 は 1.5 GHz までです (掃引の終わりが 3 GHz)');
    expect(rangeNotice('h4', 10e3, 1e6)).toContain('50 kHz から');
    expect(rangeNotice('plus4', 1e6, 4.4e9)).toBeNull();
  });
});
