import { describe, expect, test } from 'vitest';
import { findTrigger, screenOf, timesOf } from './screen.ts';

const sampled = (f: (t: number) => number, perDiv: number): { samples: Float64Array; screen: ReturnType<typeof screenOf> } => {
  const screen = screenOf(perDiv, 8192);
  return { samples: Float64Array.from(timesOf(screen), f), screen };
};

describe('screen', () => {
  test('spans ten divisions around t = 0', () => {
    const screen = screenOf(1e-3, 8192);
    expect(screen.span).toBe(10e-3);
    expect(screen.left).toBe(-5e-3);
    const times = timesOf(screen);
    expect(times[0]).toBe(-5e-3);
    expect(times[8191]).toBeCloseTo(5e-3, 15);
  });
});

describe('findTrigger', () => {
  // 0〜2 V の方形波。立ち上がりが t = 1 ms に来るようにずらしてある。
  const square = (t: number): number => ((((t - 1e-3) * 100) % 1) + 1) % 1 < 0.5 ? 2 : 0;

  test('finds the rising edge nearest the centre', () => {
    const { samples, screen } = sampled(square, 1e-3);
    expect(findTrigger(samples, screen, 'rising', 1)).toBeCloseTo(1e-3, 6);
  });

  test('finds the falling edge, and a level in the middle when none is given', () => {
    const { samples, screen } = sampled(square, 1e-3);
    expect(findTrigger(samples, screen, 'falling', null)).toBeCloseTo(-4e-3, 6);
  });

  test('gives null when the level is outside the wave', () => {
    const { samples, screen } = sampled(square, 1e-3);
    expect(findTrigger(samples, screen, 'rising', 3)).toBeNull();
    expect(findTrigger(Float64Array.from([1, 1, 1]), screenOf(1e-3, 3), 'rising', null)).toBeNull();
  });

  test('takes the left one of two crossings at the same distance', () => {
    // 1 kHz の正弦を半周期ずらす: 上向きの 0 の横切りは ±0.5 ms に 2 つ。
    const { samples, screen } = sampled((t) => Math.sin(2 * Math.PI * 1000 * t + Math.PI), 0.2e-3);
    expect(findTrigger(samples, screen, 'rising', 0)).toBeCloseTo(-0.5e-3, 6);
  });
});
