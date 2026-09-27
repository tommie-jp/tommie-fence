import { describe, expect, test } from 'vitest';
import { parseWave } from 'fence-kit';
import type { WaveSpec } from 'fence-kit';
import { samplesOf, valueAt, warmupOf } from './channel.ts';
import type { ChannelSpec } from './channel.ts';
import type { Op } from './ops.ts';
import { screenOf } from './screen.ts';

const wave = (text: string): WaveSpec => {
  const read = parseWave(text);
  if (!read.ok) throw new Error(read.reason);
  return read.value;
};

const ch = (name: ChannelSpec['name'], source: string, ops: readonly Op[] = []): ChannelSpec => ({
  name,
  source: /^ch\d$/.test(source) ? { kind: 'ref', channel: source as ChannelSpec['name'] } : { kind: 'wave', wave: wave(source) },
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
