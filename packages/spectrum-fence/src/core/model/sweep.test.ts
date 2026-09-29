import { describe, expect, test } from 'vitest';
import { DEVICES } from './device.ts';
import { centered, deviceSweep, frequenciesOf, parseFrequency, parseSweep, rangeNotice, snapPoints } from './sweep.ts';

describe('parseFrequency', () => {
  test('reads a prefix or Hz, and a bare 0', () => {
    expect(parseFrequency('100M')).toBe(100e6);
    expect(parseFrequency('300kHz')).toBe(300e3);
    expect(parseFrequency('50Hz')).toBe(50);
    expect(parseFrequency('0')).toBe(0);
  });

  test('refuses a bare number and a lower-case m', () => {
    expect(parseFrequency('1000')).toBeNull();
    expect(parseFrequency('300m')).toBeNull();
  });
});

describe('parseSweep', () => {
  test('reads start-stop and the points', () => {
    expect(parseSweep('0-960M 450')).toEqual({ ok: true, value: { start: 0, stop: 960e6, points: 450 } });
    expect(parseSweep('0-20kHz')).toEqual({ ok: true, value: { start: 0, stop: 20e3, points: null } });
  });

  test('says why it cannot read', () => {
    expect(parseSweep('960M-0').ok).toBe(false);
    expect(parseSweep('0-20000').ok).toBe(false);
    expect(parseSweep('0-20G').ok).toBe(false);
    expect(parseSweep('0-1M 10')).toMatchObject({ ok: false, reason: '点数は 51〜1001 の整数で書きます' });
    expect(parseSweep('0-1M 101 x').ok).toBe(false);
    expect(parseSweep('1M').ok).toBe(false);
  });
});

describe('centered', () => {
  test('is the same sweep as start-stop', () => {
    expect(centered(30e6, 2e6)).toEqual({ ok: true, value: { start: 29e6, stop: 31e6, points: null } });
  });

  test('refuses zero span and a sweep below 0 Hz', () => {
    expect(centered(30e6, 0)).toMatchObject({ ok: false, reason: 'span: 0 (ゼロスパン) はまだ描けません' });
    expect(centered(1e6, 4e6).ok).toBe(false);
  });
});

describe('the device and the sweep', () => {
  test('takes the whole range when sweep: is not written', () => {
    expect(deviceSweep(DEVICES.ad2)).toEqual({ start: 0, stop: 30e6, points: null });
  });

  test('sets the AD and tinySA ranges and input limits from the makers\' specs', () => {
    expect(DEVICES.ad2.range.max).toBe(30e6);
    expect(DEVICES.ad3.range.max).toBe(30e6);
    expect(DEVICES.ad3.maxInput.volts).toBe(25);
    expect(DEVICES['tinysa-ultra'].range.max).toBe(6e9);
    expect(DEVICES['tinysa-ultra'].maxInput.dbm).toBe(6);
    expect(DEVICES.tinysa.maxInput.dbm).toBe(10);
  });

  test('says when the sweep leaves the range', () => {
    expect(rangeNotice(DEVICES.tinysa, 0, 1.5e9)).toBe('tinySA は 960 MHz までです (掃引の終わりが 1.5 GHz)');
    expect(rangeNotice(DEVICES['tinysa-ultra'], 0, 960e6)).toBeNull();
  });

  test('rounds the points to the menu of the instrument, and says so', () => {
    expect(snapPoints(DEVICES['tinysa-ultra'], 450)).toEqual({ points: 450, said: null });
    expect(snapPoints(DEVICES['tinysa-ultra'], 401)).toEqual({ points: 450, said: 'tinySA Ultra の点数は 51 / 101 / 145 / 290 / 450 から選びます (450 点で描いています)' });
    expect(snapPoints(DEVICES.generic, 401)).toEqual({ points: 401, said: null });
  });

  test('spaces the points evenly, both ends included', () => {
    expect(frequenciesOf({ start: 0, stop: 1e6 }, 5)).toEqual([0, 250e3, 500e3, 750e3, 1e6]);
  });
});
