import { describe, expect, test } from 'vitest';
import type { Trace } from '../model/readings.ts';
import { screenOf } from '../model/screen.ts';
import { centerPosition, fitNotice, screenExtent, suggestRange } from './fit.ts';

describe('suggestRange', () => {
  test.each([
    [1.2246, 0.2], [5, 1], [10, 2], [1, 0.2], [0.9, 0.2], [2.4, 0.5], [3e-3, 5e-4], [0.15, 0.05], [1.4, 0.2], [1.41, 0.5],
  ])('fits a swing of %s V in 7 divisions or fewer with %s V/div', (vpp, perDiv) => {
    expect(suggestRange(vpp)).toBeCloseTo(perDiv, 12);
  });

  test('stays inside the V/div the parser accepts', () => {
    expect(suggestRange(1e-9)).toBe(1e-6);
    expect(suggestRange(1e9)).toBe(1e4);
  });
});

describe('centerPosition', () => {
  test.each([
    [2.5, 0.2, -12.5], [2.51, 0.2, -12.5], [0, 1, 0], [-1, 1, 1], [0.1, 1, 0],
  ])('centres a wave whose middle is %s V at %s V/div with position %s', (middle, perDiv, position) => {
    expect(Object.is(centerPosition(middle, perDiv), position)).toBe(true);
  });
});

describe('screenExtent', () => {
  const screen = screenOf(1, 11);
  const trace = (t0: number, values: readonly number[]): Trace =>
    ({ name: 'ch1', samples: Float64Array.from(values), dt: 1, t0, basis: 'model' });

  test('looks only at the points on the screen', () => {
    // 画面は -5 s 〜 5 s。記録は -7 s から 1 s 間隔で 15 点 (前後 2 点ずつが画面の外)。
    const values = [100, 100, ...Array.from({ length: 11 }, (_, index) => index), -100, -100];
    expect(screenExtent(trace(-7, values), screen)).toEqual({ min: 0, max: 10 });
  });

  test('is null when no point is on the screen', () => {
    expect(screenExtent(trace(20, [1, 2]), screen)).toBeNull();
  });
});

const fit = (min: number, max: number, range: number | null, position: number | null, scale: { perDiv: number; position: number }) =>
  fitNotice({ name: 'ch2', extent: { min, max }, range, position, scale });

describe('fitNotice — 振れが小さい', () => {
  test('says a written range leaves the wave under 2 divisions, with the range and position that fix it', () => {
    expect(fit(1.8877, 3.1123, 1, -3, { perDiv: 1, position: -3 })).toBe(
      'CH2 の振れは 1.2 目盛です (range: 200mV/div と position: -12.5div なら 6.1 目盛で中央に来ます)',
    );
  });

  test('gives only the range when position: was left to Auto', () => {
    expect(fit(1.8877, 3.1123, 1, null, { perDiv: 1, position: -3 })).toBe(
      'CH2 の振れは 1.2 目盛です (range: 200mV/div なら 6.1 目盛になります)',
    );
  });

  test('says nothing from 2 divisions up, under Auto, or for a flat line', () => {
    expect(fit(1.8877, 3.1123, 0.5, -4, { perDiv: 0.5, position: -4 })).toBeNull();
    expect(fit(1.8877, 3.1123, null, null, { perDiv: 1, position: -3 })).toBeNull();
    expect(fit(2, 2, 1, 0, { perDiv: 1, position: 0 })).toBeNull();
  });

  test('says why it cannot centre a small wave far from 0 V', () => {
    expect(fit(100, 100.1, 1, -100, { perDiv: 1, position: -100 })).toBe(
      'CH2 の振れは 0.1 目盛です (中央の 100 V が遠く、range: を細かくすると position: の範囲 (±100div) に入りません)',
    );
  });
});

describe('fitNotice — はみ出し', () => {
  test('moves the position when the wave fits at the written range', () => {
    expect(fit(0, 5, 1, 0, { perDiv: 1, position: 0 })).toBe(
      'CH2 は画面の上に 1.0 目盛はみ出しています (position: -2.5div なら入ります)',
    );
    expect(fit(0, 5, null, 3, { perDiv: 1, position: 3 })).toBe(
      'CH2 は画面の上に 4.0 目盛はみ出しています (position: -2.5div なら入ります)',
    );
    expect(fit(-5, 0, 1, -2, { perDiv: 1, position: -2 })).toBe(
      'CH2 は画面の下に 3.0 目盛はみ出しています (position: 2.5div なら入ります)',
    );
  });

  test('widens the range, keeping the position, when the wave is taller than the screen', () => {
    expect(fit(0, 10, 1, -4, { perDiv: 1, position: -4 })).toBe(
      'CH2 は画面の上に 2.0 目盛はみ出しています (range: 2V/div なら入ります)',
    );
    expect(fit(-6, 6, 1, 0, { perDiv: 1, position: 0 })).toBe(
      'CH2 は画面の上に 2.0 目盛、下に 2.0 目盛はみ出しています (range: 2V/div なら入ります)',
    );
  });

  test('gives range and position together when no range fits at the written position', () => {
    expect(fit(0, 10, 1, 5, { perDiv: 1, position: 5 })).toBe(
      'CH2 は画面の上に 11.0 目盛はみ出しています (range: 2V/div と position: -2.5div なら入ります)',
    );
  });

  test('gives range and position together when the wave is also small', () => {
    expect(fit(10, 11, 1, 0, { perDiv: 1, position: 0 })).toBe(
      'CH2 は画面の上に 7.0 目盛はみ出しています (range: 200mV/div と position: -52.5div なら入ります)',
    );
  });

  test('lets a wave touch the edge, and says nothing under Auto', () => {
    expect(fit(-4, 4, 1, 0, { perDiv: 1, position: 0 })).toBeNull();
    expect(fit(0, 4.04, 1, 0, { perDiv: 1, position: 0 })).toBeNull();
    expect(fit(0, 50, null, null, { perDiv: 1, position: 0 })).toBeNull();
  });
});

describe('fitNotice — 同じ尺度で重ねて比べる', () => {
  type Scale = { perDiv: number; position: number };
  const input = (name: 'ch1' | 'ch2' | 'ch3', min: number, max: number, range: number | null, position: number | null, scale: Scale) =>
    ({ name, extent: { min, max }, range, position, scale });
  const small = input('ch2', 1.8877, 3.1123, 1, -3, { perDiv: 1, position: -3 });

  test('says nothing of a small channel when a channel on the same range and position swings 2 divisions or more', () => {
    const large = input('ch1', 0, 5, 1, -3, { perDiv: 1, position: -3 });
    expect(fitNotice(small, [large, small])).toBeNull();
  });

  test('still says it when every channel on the same scale is small', () => {
    const alsoSmall = input('ch1', 2, 3.5, 1, -3, { perDiv: 1, position: -3 });
    expect(fitNotice(small, [alsoSmall, small])).toBe(
      'CH2 の振れは 1.2 目盛です (range: 200mV/div と position: -12.5div なら 6.1 目盛で中央に来ます)',
    );
  });

  test('still says it for a channel alone, or whose large partner is on another range or position', () => {
    const message = 'CH2 の振れは 1.2 目盛です (range: 200mV/div と position: -12.5div なら 6.1 目盛で中央に来ます)';
    expect(fitNotice(small, [small])).toBe(message);
    expect(fitNotice(small, [input('ch1', 0, 5, 0.5, -3, { perDiv: 0.5, position: -3 })])).toBe(message);
    expect(fitNotice(small, [input('ch1', 0, 5, 1, -2, { perDiv: 1, position: -2 })])).toBe(message);
    expect(fitNotice(small, [input('ch1', 0, 5, null, -3, { perDiv: 1, position: -3 })])).toBe(message);
  });

  test('keeps the notice of running off the screen even with a large partner', () => {
    const off = input('ch2', 10, 11, 1, 0, { perDiv: 1, position: 0 });
    const large = input('ch1', 0, 5, 1, 0, { perDiv: 1, position: 0 });
    expect(fitNotice(off, [large, off])).toBe(
      'CH2 は画面の上に 7.0 目盛はみ出しています (range: 200mV/div と position: -52.5div なら入ります)',
    );
  });
});
