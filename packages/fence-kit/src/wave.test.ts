import { describe, expect, test } from 'vitest';
import { parseWave, periodOf, sampleWave } from './wave.ts';
import type { WaveSpec } from './wave.ts';

const wave = (text: string): WaveSpec => {
  const read = parseWave(text);
  if (!read.ok) throw new Error(read.reason);
  return read.value;
};

/** 1 周期を細かく刻んだ RMS (数値で確かめる)。 */
const rmsOf = (spec: WaveSpec): number => {
  const n = 100_000;
  const period = periodOf(spec) ?? 1;
  let sum = 0;
  for (let i = 0; i < n; i += 1) sum += sampleWave(spec, (i / n) * period) ** 2;
  return Math.sqrt(sum / n);
};

describe('parseWave', () => {
  test('reads the generator line with keywords in any order', () => {
    expect(wave('square 100Hz 1V offset 1V')).toEqual({
      shape: 'square', frequency: 100, amplitude: 1, offset: 1, phase: 0, duty: 0.5,
    });
    expect(wave('sine 1kHz 0.85V phase -58deg')).toMatchObject({ phase: -58 });
    expect(wave('pulse 1kHz 1V duty 25% offset -1V')).toMatchObject({ duty: 0.25, offset: -1 });
    expect(wave('dc 5V')).toEqual({ shape: 'dc', frequency: null, amplitude: 5, offset: 0, phase: 0, duty: 0.5 });
    expect(wave('dc -0.7V').amplitude).toBe(-0.7);
  });

  test('takes the amplitude as peak: Vpp is halved, Vrms of a sine is multiplied by root two', () => {
    expect(wave('sine 1kHz 2Vpp').amplitude).toBe(1);
    expect(wave('square 1kHz 2Vpp').amplitude).toBe(1);
    expect(wave('sine 1kHz 0.707Vrms').amplitude).toBeCloseTo(1.000, 3);
    expect(wave('sine 1MHz -10dBm').amplitude).toBeCloseTo(0.1, 6);
  });

  test('says which default it filled in when it shapes the figure', () => {
    const read = parseWave('pulse 1kHz 1V');
    expect(read.ok && read.assumed).toEqual(['pulse の duty は既定の 25% で描いています']);
    const square = parseWave('square 1kHz 1V');
    expect(square.ok && square.assumed).toEqual([]);
  });

  test.each([
    ['sine 1000 1', '周波数は 1kHz / 100Hz のように単位を付けます', '1000'],
    ['sine 1kHz 1', '振幅は 1V / 500mV / 2Vpp のように単位を付けます', '1'],
    ['sine 1k 1V', '周波数は 1kHz / 100Hz のように単位を付けます', '1k'],
    ['sine 1V 1kHz', '周波数を先に書きます (例: sine 1kHz 1V)', '1V'],
    ['cosine 1kHz 1V', '波は sine / square / triangle / sawtooth / pulse / dc のどれかです', 'cosine'],
    ['sine', 'sine は周波数と振幅を書きます (例: sine 1kHz 1V)', 'sine'],
    ['sine 1kHz', 'sine は周波数と振幅を書きます (例: sine 1kHz 1V)', 'sine'],
    ['square 1kHz 0.707Vrms', 'Vrms は sine だけに書けます (ほかの波は 1V か 2Vpp で)', '0.707Vrms'],
    ['sine 1kHz 1V duty 25%', 'duty は square と pulse だけに書けます', 'duty'],
    ['sine 1kHz 1V offset 1', 'offset は 1V / -500mV のように単位を付けます', '1'],
    ['sine 1kHz 1V phase 90', 'phase は 90deg / -58deg のように単位を付けます', '90'],
    ['square 1kHz 1V duty 0.25', 'duty は 25% のように % で書きます (0% と 100% は書けません)', '0.25'],
    ['sine 1kHz 1V gain 2', '知らない語です: gain (書けるのは offset / phase / duty)', 'gain'],
    ['sine 1kHz 1V offset 1V offset 2V', 'offset が 2 つあります', 'offset'],
    ['sine 1kHz 1V offset', 'offset の後ろに値を書きます (例: offset 1V)', 'offset'],
    ['sine 1kHz 0V', '振幅は 0 より大きくします (負の値や 0 は offset で)', '0V'],
    ['sine 1kHz -1V', '振幅は 0 より大きくします (負の値や 0 は offset で)', '-1V'],
    ['sine 1kHz 1V offset 2Vpp', 'offset は 1V / -500mV のように書きます (Vpp・Vrms・dBm は振幅だけ)', '2Vpp'],
    ['dc 1kHz 5V', 'dc は「dc 5V」の形で書きます (周波数も offset も phase も書きません)', '1kHz'],
    ['dc 5V offset 1V', 'dc は「dc 5V」の形で書きます (周波数も offset も phase も書きません)', 'offset'],
    ['dc 5', '振幅は 1V / 500mV / 2Vpp のように単位を付けます', '5'],
    ['dc 2Vpp', 'dc は 5V / -0.7V のように書きます (Vpp・Vrms・dBm は書けません)', '2Vpp'],
  ])('refuses %s and says how to write it', (text, reason, token) => {
    expect(parseWave(text)).toEqual({ ok: false, reason, token });
  });
});

describe('sampleWave', () => {
  test('sine starts at zero going up', () => {
    const spec = wave('sine 1kHz 1V');
    expect(sampleWave(spec, 0)).toBeCloseTo(0, 12);
    expect(sampleWave(spec, 0.25e-3)).toBeCloseTo(1, 12);
    expect(rmsOf(spec)).toBeCloseTo(0.707, 3);
  });

  test('square rises at t = 0', () => {
    const spec = wave('square 100Hz 1V offset 1V');
    expect(sampleWave(spec, 1e-3)).toBe(2);
    expect(sampleWave(spec, -1e-3)).toBe(0);
  });

  test('triangle and sawtooth start at the bottom and have an RMS of A over root three', () => {
    const triangle = wave('triangle 1kHz 1V');
    const sawtooth = wave('sawtooth 1kHz 1V');
    expect(sampleWave(triangle, 0)).toBe(-1);
    expect(sampleWave(triangle, 0.5e-3)).toBeCloseTo(1, 12);
    expect(sampleWave(sawtooth, 0)).toBe(-1);
    expect(sampleWave(sawtooth, 0.5e-3)).toBeCloseTo(0, 12);
    expect(rmsOf(triangle)).toBeCloseTo(0.577, 3);
    expect(rmsOf(sawtooth)).toBeCloseTo(0.577, 3);
  });

  test('pulse is high for the duty, and a phase shifts the wave later when negative', () => {
    const pulse = wave('pulse 1kHz 1V duty 25%');
    expect(sampleWave(pulse, 0.2e-3)).toBe(1);
    expect(sampleWave(pulse, 0.3e-3)).toBe(-1);
    const lagging = wave('sine 1kHz 1V phase -90deg');
    expect(sampleWave(lagging, 0.25e-3)).toBeCloseTo(0, 12);
    expect(sampleWave(lagging, 0.5e-3)).toBeCloseTo(1, 12);
  });

  test('dc is its value at every time, and has no period', () => {
    const dc = wave('dc 5V');
    expect(sampleWave(dc, 123)).toBe(5);
    expect(periodOf(dc)).toBeNull();
    expect(periodOf(wave('sine 1kHz 1V'))).toBe(1e-3);
  });
});
