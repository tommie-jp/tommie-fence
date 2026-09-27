import { describe, expect, test } from 'vitest';
import { parseWave } from 'fence-kit';
import { samplesOf } from './channel.ts';
import type { ChannelSpec } from './channel.ts';
import { measure } from './measure.ts';
import type { Op } from './ops.ts';
import { findTrigger, screenOf } from './screen.ts';

/**
 * 計画 (52 の docs/85 §3.1) の表。値は手元で検算した (2026-09-27・28、Python)。
 * RC の定常の 3 つ (1 ms・2 ms・Rise) は厳密解に直した (計画の表は 1.261 / 1.720 / 2.20 ms)。
 */
const channel = (name: ChannelSpec['name'], source: string, ops: readonly Op[] = []): ChannelSpec => {
  if (/^ch\d$/.test(source)) return { name, source: { kind: 'ref', channel: source as ChannelSpec['name'] }, ops, range: null, position: null, line: null };
  const read = parseWave(source);
  if (!read.ok) throw new Error(read.reason);
  return { name, source: { kind: 'wave', wave: read.value }, ops, range: null, position: null, line: null };
};

/** ch1 の立ち上がりで t = 0 に合わせて標本化する (本体と同じ手順)。 */
function run(channels: readonly ChannelSpec[], perDiv: number) {
  const screen = screenOf(perDiv, 8192);
  const first = samplesOf(channels, screen, 0).samples.get('ch1') ?? new Float64Array();
  const shift = findTrigger(first, screen, 'rising', null) ?? 0;
  const { samples } = samplesOf(channels, screen, shift);
  const at = (name: ChannelSpec['name'], t: number): number => {
    const values = samples.get(name) ?? new Float64Array();
    const index = (t - screen.left) / screen.dt;
    const i = Math.floor(index);
    return (values[i] ?? 0) + ((values[i + 1] ?? 0) - (values[i] ?? 0)) * (index - i);
  };
  const m = (name: Parameters<typeof measure>[0], ch: ChannelSpec['name'] = 'ch1') =>
    measure(name, samples.get(ch) ?? new Float64Array(), screen.dt, samples.get('ch1'));
  return { at, m };
}

describe('measure — 波', () => {
  test('sine 1kHz 1V', () => {
    const { at, m } = run([channel('ch1', 'sine 1kHz 1V')], 0.2e-3);
    expect(m('vpp')).toBeCloseTo(2, 3);
    expect(m('rms')).toBeCloseTo(0.707, 3);
    expect(m('freq')).toBeCloseTo(1000, 1);
    expect(m('period')).toBeCloseTo(1e-3, 7);
    expect(at('ch1', 0.25e-3)).toBeCloseTo(1, 3);
  });

  test('square 100Hz 1V offset 1V', () => {
    const { at, m } = run([channel('ch1', 'square 100Hz 1V offset 1V')], 2e-3);
    expect(at('ch1', 1e-3)).toBe(2);
    expect(at('ch1', -1e-3)).toBe(0);
    expect(m('avg')).toBeCloseTo(1, 2);
    expect(m('duty')).toBeCloseTo(0.5, 3);
  });

  test('triangle and sawtooth have an RMS of 0.577 V', () => {
    expect(run([channel('ch1', 'triangle 1kHz 1V')], 0.2e-3).m('rms')).toBeCloseTo(0.577, 3);
    expect(run([channel('ch1', 'sawtooth 1kHz 1V')], 0.2e-3).m('rms')).toBeCloseTo(0.577, 3);
  });

  test('pulse 1kHz 1V duty 25%', () => {
    expect(run([channel('ch1', 'pulse 1kHz 1V duty 25%')], 0.2e-3).m('duty')).toBeCloseTo(0.25, 3);
  });
});

describe('measure — 操作', () => {
  test('square 100Hz 1V offset 1V | rc 1ms in steady state', () => {
    const { at, m } = run([channel('ch1', 'square 100Hz 1V offset 1V'), channel('ch2', 'ch1', [{ kind: 'rc', tau: 1e-3 }])], 2e-3);
    expect(m('vmax', 'ch2')).toBeCloseTo(1.987, 3);
    expect(m('vmin', 'ch2')).toBeCloseTo(0.013, 3);
    expect(m('vpp', 'ch2')).toBeCloseTo(1.973, 3);
    expect(at('ch2', 1e-3)).toBeCloseTo(1.269, 3);
    expect(at('ch2', 2e-3)).toBeCloseTo(1.731, 3);
    expect(m('rise', 'ch2')).toBeCloseTo(2.139e-3, 6);
    expect(m('freq', 'ch2')).toBeCloseTo(100, 2);
  });

  test('sine 1kHz 1V | rc 1ms lags by 81 degrees', () => {
    const { m } = run([channel('ch1', 'sine 1kHz 1V'), channel('ch2', 'ch1', [{ kind: 'rc', tau: 1e-3 }])], 0.2e-3);
    expect(m('vpp', 'ch2')).toBeCloseTo(0.314, 3);
    expect(m('phase', 'ch2')).toBeCloseTo(-81.0, 1);
  });

  test('clipper and clamper (1-9)', () => {
    const clip = run([channel('ch1', 'square 1kHz 5V'), channel('ch2', 'ch1', [{ kind: 'clip', low: -0.7, high: 0.7 }])], 0.2e-3);
    expect(clip.m('vmax', 'ch2')).toBeCloseTo(0.7, 9);
    expect(clip.m('vmin', 'ch2')).toBeCloseTo(-0.7, 9);
    const clamp = run([channel('ch1', 'square 1kHz 5V'), channel('ch2', 'ch1', [{ kind: 'offset', volts: 4.3 }])], 0.2e-3);
    expect(clamp.m('vmax', 'ch2')).toBeCloseTo(9.3, 9);
    expect(clamp.m('vmin', 'ch2')).toBeCloseTo(-0.7, 9);
  });

  test('rectifiers: abs and clip 0V', () => {
    const full = run([channel('ch1', 'sine 1kHz 1V'), channel('ch2', 'ch1', [{ kind: 'abs' }])], 0.2e-3);
    expect(full.m('avg', 'ch2')).toBeCloseTo(0.637, 3);
    expect(full.m('rms', 'ch2')).toBeCloseTo(0.707, 3);
    const half = run([channel('ch1', 'sine 1kHz 1V'), channel('ch2', 'ch1', [{ kind: 'clip', low: 0, high: null }])], 0.2e-3);
    expect(half.m('avg', 'ch2')).toBeCloseTo(0.318, 3);
    expect(half.m('rms', 'ch2')).toBeCloseTo(0.5, 3);
  });

  test('3-4: CH2 lags CH1 by 58 degrees', () => {
    const { m } = run([channel('ch1', 'sine 1kHz 0.53V'), channel('ch2', 'sine 1kHz 0.85V phase -58deg')], 0.2e-3);
    expect(m('phase', 'ch2')).toBeCloseTo(-58.0, 1);
  });
});

describe('measure — 測れないとき', () => {
  test('gives null for a frequency, a duty or a phase with less than one period', () => {
    const flat = new Float64Array(100).fill(1);
    expect(measure('freq', flat, 1e-6)).toBeNull();
    expect(measure('period', flat, 1e-6)).toBeNull();
    expect(measure('duty', flat, 1e-6)).toBeNull();
    expect(measure('phase', flat, 1e-6, flat)).toBeNull();
    expect(measure('rise', flat, 1e-6)).toBeNull();
    expect(measure('vpp', flat, 1e-6)).toBe(0);
    expect(measure('avg', flat, 1e-6)).toBe(1);
    expect(measure('vmax', new Float64Array(), 1e-6)).toBeNull();
  });
});
