import { describe, expect, test } from 'vitest';
import { DEVICES } from './device.ts';
import { autoRbw, floorOf, inputNotice, lineDbm, rbwProblem } from './receiver.ts';
import { linesOfSignal } from './signal.ts';
import { wave } from './testWave.ts';

const ultra = DEVICES['tinysa-ultra'];

describe('floorOf', () => {
  test('follows the RBW: −102 / −112 / −92 dBm at 30k / 3k / 300k (Ultra)', () => {
    expect(floorOf(ultra, 30e3, 0, false, null)).toBeCloseTo(-102, 9);
    expect(floorOf(ultra, 3e3, 0, false, null)).toBeCloseTo(-112, 9);
    expect(floorOf(ultra, 300e3, 0, false, null)).toBeCloseTo(-92, 9);
  });

  test('goes up with the attenuator and down with the LNA', () => {
    expect(floorOf(ultra, 30e3, 20, false, null)).toBeCloseTo(-82, 9);
    expect(floorOf(ultra, 30e3, 0, true, null)).toBeCloseTo(-102 - (ultra.lnaGain ?? 0), 9);
  });

  test('takes floor: as written on generic (−100 dBm when not)', () => {
    expect(floorOf(DEVICES.generic, 30e3, 0, false, -130)).toBe(-130);
    expect(floorOf(DEVICES.generic, 30e3, 10, false, null)).toBe(-90);
  });
});

describe('RBW', () => {
  test('picks the smallest choice at or above span / points', () => {
    expect(autoRbw(ultra, 960e6, 450)).toBe(850e3);
    expect(autoRbw(ultra, 2e6, 450)).toBe(10e3);
    expect(autoRbw(ultra, 1e3, 450)).toBe(200);
  });

  test('takes only the menu values, except on generic', () => {
    expect(rbwProblem(ultra, 300e3)).toBeNull();
    expect(rbwProblem(ultra, 5e3)).toBe('tinySA Ultra の RBW は 200 Hz / 1 kHz / 3 kHz / 10 kHz / 30 kHz / 100 kHz / 300 kHz / 600 kHz / 850 kHz から選びます');
    expect(rbwProblem(DEVICES.generic, 5e3)).toBeNull();
    expect(rbwProblem(DEVICES.generic, 50e6)).toBe('Generic の RBW は 1 Hz〜10 MHz です');
    expect(rbwProblem(DEVICES.ad2, 1)).toBeNull();
  });
});

describe('inputNotice', () => {
  test('says when the signal is above the input limit (+6 dBm on Ultra)', () => {
    expect(inputNotice(ultra, linesOfSignal([wave('sine 100MHz +10dBm')], 1e9, 10).lines))
      .toBe('入力の上限 +6 dBm を超えています (信号の電力の和が +10 dBm。アッテネータを先に入れます)');
    expect(inputNotice(ultra, linesOfSignal([wave('sine 100MHz -10dBm')], 1e9, 10).lines)).toBeNull();
    expect(inputNotice(DEVICES.generic, [{ frequency: 1e6, amplitude: 100 }])).toBeNull();
  });

  test('counts a dc line by its value', () => {
    expect(lineDbm({ frequency: 0, amplitude: 1 })).toBeCloseTo(13.01, 2);
    expect(lineDbm({ frequency: 1e6, amplitude: 1 })).toBeCloseTo(10, 2);
  });
});
