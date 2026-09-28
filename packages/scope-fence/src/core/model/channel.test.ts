import { describe, expect, test } from 'vitest';
import { parseWave } from 'fence-kit';
import type { WaveSpec } from 'fence-kit';
import { samplesOf, valueAt, warmupOf } from './channel.ts';
import { parseExpr } from './expr.ts';
import { measure } from './measure.ts';
import type { ChannelSpec } from './channel.ts';
import type { Op } from './ops.ts';
import { screenOf } from './screen.ts';

const wave = (text: string): WaveSpec => {
  const read = parseWave(text);
  if (!read.ok) throw new Error(read.reason);
  return read.value;
};

/** 元の綴り: `ch1` は参照、`= …` は式 (前の ch を参照できる)、ほかは波。 */
const sourceOf = (name: ChannelSpec['name'], source: string): ChannelSpec['source'] => {
  if (/^ch\d$/.test(source)) return { kind: 'ref', channel: source as ChannelSpec['name'] };
  if (!source.startsWith('=')) return { kind: 'wave', wave: wave(source) };
  const before = (['ch1', 'ch2', 'ch3'] as const).slice(0, Number(name.slice(2)) - 1);
  const read = parseExpr(source.slice(1), before);
  if (!read.ok) throw new Error(read.error.message);
  return { kind: 'expr', expr: read.value.expr };
};

const ch = (name: ChannelSpec['name'], source: string, ops: readonly Op[] = []): ChannelSpec => ({
  name,
  source: sourceOf(name, source),
  ops,
  range: null,
  position: null,
  line: null,
});

describe('warmupOf', () => {
  test('runs ten tau plus the longest period', () => {
    expect(warmupOf([ch('ch1', 'square 100Hz 1V'), ch('ch2', 'ch1', [{ kind: 'rc', tau: 1e-3 }])])).toBeCloseTo(20e-3, 12);
    expect(warmupOf([ch('ch1', 'dc 5V')])).toBe(0);
  });
});

describe('samplesOf', () => {
  test('gives each channel one screen of samples, the reference computed from the channel before', () => {
    const screen = screenOf(1e-3, 8192);
    const { samples, settled } = samplesOf([ch('ch1', 'square 100Hz 1V offset 1V'), ch('ch2', 'ch1')], screen, 0);
    expect(settled).toBe(true);
    expect(samples.get('ch1')).toHaveLength(8192);
    expect([...(samples.get('ch2') ?? [])]).toEqual([...(samples.get('ch1') ?? [])]);
  });

  test('shifts the time by the trigger offset', () => {
    const screen = screenOf(0.2e-3, 8192);
    const plain = samplesOf([ch('ch1', 'sine 1kHz 1V')], screen, 0).samples.get('ch1');
    const shifted = samplesOf([ch('ch1', 'sine 1kHz 1V')], screen, 0.25e-3).samples.get('ch1');
    const middle = 4096;
    expect(shifted?.[middle]).toBeCloseTo(Math.sin(2 * Math.PI * 1000 * (screen.left + middle * screen.dt + 0.25e-3)), 9);
    expect(plain?.[middle]).not.toBeCloseTo(shifted?.[middle] ?? 0, 3);
  });

  test('says when the warm-up had to be cut short', () => {
    const screen = screenOf(1e-6, 8192);
    const { settled } = samplesOf([ch('ch1', 'square 1kHz 1V', [{ kind: 'rc', tau: 1 }])], screen, 0);
    expect(settled).toBe(false);
  });
});

describe('valueAt', () => {
  test('averages across a jump so the edge lands between points where it really is', () => {
    const square = wave('square 1kHz 1V');
    // 跳び (t = 0) が点の区間のちょうど真ん中: 平均は 0。
    expect(valueAt(square, 0, 1e-6)).toBeCloseTo(0, 9);
    // 区間の 1/4 だけ高い: −1 + 2 × 0.25 = −0.5。
    expect(valueAt(square, -0.25e-6, 1e-6)).toBeCloseTo(-0.5, 9);
    expect(valueAt(square, 0.25e-3, 1e-6)).toBe(1);
  });

  test('averages the sawtooth ramp and its drop, and leaves smooth waves to the point value', () => {
    const saw = wave('sawtooth 1kHz 1V offset 1V');
    expect(valueAt(saw, 0, 1e-6)).toBeCloseTo(1, 6);
    expect(valueAt(saw, 0.5e-3, 1e-6)).toBeCloseTo(1, 9);
    expect(valueAt(wave('sine 1kHz 1V'), 0.25e-3, 1e-6)).toBe(1);
    expect(valueAt(wave('dc 2V'), 1, 1)).toBe(2);
  });
});

describe('samplesOf — expressions', () => {
  test('evaluates an expression on the same time grid, referencing the channel before', () => {
    const screen = screenOf(0.2e-3, 8192);
    const { samples } = samplesOf([ch('ch1', 'sine 1kHz 1V'), ch('ch2', '= 2 * ch1 + 1V'), ch('ch3', '= 1V * sin(2 * pi * 1kHz * t)')], screen, 0.1e-3);
    const [one, two, three] = ['ch1', 'ch2', 'ch3'].map((name) => samples.get(name as 'ch1'));
    for (const index of [0, 1000, 4096, 8191]) {
      expect(two?.[index]).toBeCloseTo(2 * (one?.[index] ?? 0) + 1, 12);
      // 式の t は波の t と同じ (トリガのずれも同じだけ掛かる)。
      expect(three?.[index]).toBeCloseTo(one?.[index] ?? 0, 9);
    }
  });

  test('passes an expression through operations, and counts points it could not compute', () => {
    const screen = screenOf(1e-3, 8192);
    const { samples, invalid } = samplesOf([ch('ch1', '= sqrt(t * 1V^2 / 1s)', [{ kind: 'offset', volts: 1 }])], screen, 0);
    expect(invalid.get('ch1')).toBe(4096);
    expect(samples.get('ch1')?.[0]).toBe(1);
  });
});

describe('peak — the capacitor-input rectifier (full-wave bridge, 5 V peak, Vf 0.6 V x 2)', () => {
  // 50 Hz を 5 ms/div (Auto と同じ)。理想のダイオードとコンデンサ入力の数値解 (0 Ω の源):
  // C = 100 µF・RL = 1.5 kΩ (τ = 150 ms) で Vpeak 3.80 V・Vpp 0.222 V・Vdc 3.692 V。
  const rectified = (tau: number): { readonly vpp: number; readonly avg: number; readonly vmax: number } => {
    const screen = screenOf(5e-3, 8192);
    const ops: readonly Op[] = [{ kind: 'abs' }, { kind: 'offset', volts: -1.2 }, { kind: 'clip', low: 0, high: null }, { kind: 'peak', tau }];
    const { samples, settled } = samplesOf([ch('ch1', 'sine 50Hz 5V', ops)], screen, 0);
    expect(settled).toBe(true);
    const values = samples.get('ch1') ?? new Float64Array();
    const read = (name: 'vpp' | 'avg' | 'vmax'): number => measure(name, values, screen.dt) ?? Number.NaN;
    return { vpp: read('vpp'), avg: read('avg'), vmax: read('vmax') };
  };

  test('100 µF and 1.5 kΩ (tau 150 ms): Vdc 3.69 V, ripple 0.222 Vpp', () => {
    const { vpp, avg, vmax } = rectified(150e-3);
    expect(vmax).toBeCloseTo(3.8, 3);
    expect(Math.abs(avg / 3.692 - 1)).toBeLessThan(0.01);
    expect(Math.abs(vpp / 0.222 - 1)).toBeLessThan(0.03);
  });

  test('10 µF (tau 15 ms): Vdc 3.11 V, ripple 1.46 Vpp', () => {
    const { vpp, avg } = rectified(15e-3);
    expect(Math.abs(avg / 3.105 - 1)).toBeLessThan(0.02);
    expect(Math.abs(vpp / 1.457 - 1)).toBeLessThan(0.03);
  });
});

