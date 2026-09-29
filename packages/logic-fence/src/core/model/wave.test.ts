import { describe, expect, test } from 'vitest';
import { counterBit, counterValue, countedEdges, waveOf } from './wave.ts';
import type { CounterSpec } from './wave.ts';

describe('clock', () => {
  const wave = waveOf({ kind: 'clock', frequency: 1, duty: 0.5 });

  test('is high after a rising edge and low after a falling edge, new value on the edge itself', () => {
    expect(wave.levelAt(0)).toBe(1);
    expect(wave.levelAt(0.49)).toBe(1);
    expect(wave.levelAt(0.5)).toBe(0);
    expect(wave.levelAt(1)).toBe(1);
    expect(wave.levelAt(-0.25)).toBe(0);
  });

  test('lists the edges in (lo, hi] and refuses to list too many', () => {
    expect(wave.edges(0, 2, 100)).toEqual([{ t: 0.5, v: 0 }, { t: 1, v: 1 }, { t: 1.5, v: 0 }, { t: 2, v: 1 }]);
    expect(wave.edges(0, 1e6, 4000)).toBeNull();
  });

  test('does not lose an edge to floating point (0.1 s period)', () => {
    const fast = waveOf({ kind: 'clock', frequency: 10, duty: 0.5 });
    expect(fast.levelAt(0.3)).toBe(1);
    expect(fast.edges(0, 1, 100)).toHaveLength(20);
  });

  test('honors the duty', () => {
    const quarter = waveOf({ kind: 'clock', frequency: 1, duty: 0.25 });
    expect(quarter.levelAt(0.24)).toBe(1);
    expect(quarter.levelAt(0.25)).toBe(0);
  });
});

describe('pulse, pattern, edges', () => {
  test('a pulse is high from its start for its width', () => {
    const wave = waveOf({ kind: 'pulse', at: 2, width: 0.5 });
    expect([1.99, 2, 2.49, 2.5].map(wave.levelAt)).toEqual([0, 1, 1, 0]);
    expect(wave.edges(0, 10, 10)).toEqual([{ t: 2, v: 1 }, { t: 2.5, v: 0 }]);
  });

  test('a pattern holds its first bit before it starts and its last bit after it ends', () => {
    const wave = waveOf({ kind: 'pattern', bits: '0110', bitTime: 1, from: 2, repeat: false });
    expect([0, 2, 3, 4, 5, 9].map(wave.levelAt)).toEqual([0, 0, 1, 1, 0, 0]);
    expect(wave.edges(0, 10, 10)).toEqual([{ t: 3, v: 1 }, { t: 5, v: 0 }]);
  });

  test('a repeating pattern keeps going', () => {
    const wave = waveOf({ kind: 'pattern', bits: '01', bitTime: 1, from: 0, repeat: true });
    expect([0, 1, 2, 3].map(wave.levelAt)).toEqual([0, 1, 0, 1]);
    expect(wave.edges(0, 4, 10)).toHaveLength(4);
  });

  test('edges holds each level from its time on', () => {
    const wave = waveOf({ kind: 'edges', pairs: [[0, 0], [1.5, 1], [3, 0]] });
    expect([0, 1.4, 1.5, 2.9, 3].map(wave.levelAt)).toEqual([0, 0, 1, 1, 0]);
    expect(wave.edges(0, 10, 10)).toEqual([{ t: 1.5, v: 1 }, { t: 3, v: 0 }]);
  });

  test('a level never changes', () => {
    expect(waveOf({ kind: 'level', level: 1 }).edges(0, 10, 10)).toEqual([]);
  });
});

describe('counter', () => {
  const base = { kind: 'counter', bits: null, on: 'CLK', edge: 'rising', start: 0, wrap: null, sequence: null, repeat: false } as const;
  const clock = waveOf({ kind: 'clock', frequency: 1, duty: 0.5 });

  test('takes only edges at t >= 0, of the wanted direction', () => {
    expect(countedEdges(clock, 'rising', -1e-9, 3, 100)).toEqual({ prefix: 0, times: [0, 1, 2, 3] });
    expect(countedEdges(clock, 'falling', -1e-9, 3, 100)).toEqual({ prefix: 0, times: [0.5, 1.5, 2.5] });
  });

  test('counts the edges before the window by formula, and lists only the ones inside', () => {
    expect(countedEdges(clock, 'rising', 1.5, 4, 100)).toEqual({ prefix: 2, times: [2, 3, 4] });
    expect(countedEdges(clock, 'falling', 1000000.25, 1000001, 100)).toEqual({ prefix: 1000000, times: [1000000.5] });
    expect(countedEdges(waveOf({ kind: 'clock', frequency: 1e3, duty: 0.5 }), 'rising', 1e5, 1e5 + 0.001, 100)?.times).toHaveLength(1);
  });

  test('counts from start and wraps', () => {
    const spec: CounterSpec = { ...base, start: 2, wrap: 4 };
    expect([0, 1, 2, 3, 4].map((index) => counterValue(spec, 3, index))).toEqual([2, 3, 0, 1, 2]);
  });

  test('walks a sequence, holds the last value or repeats', () => {
    const held: CounterSpec = { ...base, sequence: [0, 1, 2] };
    expect([0, 1, 2, 3, 9].map((index) => counterValue(held, 2, index))).toEqual([0, 1, 2, 2, 2]);
    const looped: CounterSpec = { ...held, repeat: true };
    expect([3, 4, 5].map((index) => counterValue(looped, 2, index))).toEqual([0, 1, 2]);
  });

  test('a bit changes at the edge that changes it', () => {
    const spec: CounterSpec = { ...base, sequence: [0, 1, 2, 3] };
    const bit0 = counterBit(spec, 2, 0, 0, [0, 1, 2, 3], -Infinity);
    const bit1 = counterBit(spec, 2, 1, 0, [0, 1, 2, 3], -Infinity);
    expect(bit0.edges(-1, 10, 10)).toEqual([{ t: 1, v: 1 }, { t: 2, v: 0 }, { t: 3, v: 1 }]);
    expect(bit1.edges(-1, 10, 10)).toEqual([{ t: 2, v: 1 }]);
    expect([-1, 0, 0.9, 1, 2, 3].map(bit0.levelAt)).toEqual([0, 0, 0, 1, 0, 1]);
  });
});
