import { describe, expect, test } from 'vitest';
import { envelopeOf, heldTrace, snapshotsOf } from './hold.ts';
import type { HoldEntry } from './hold.ts';
import type { Point } from './trace.ts';
import { wave } from './testWave.ts';

const pt = (f: number, level: number, at = f): Point => ({ f, level, at });

describe('envelopeOf — 点ごとの最大', () => {
  test('takes the maximum of each point across the traces', () => {
    const a = [pt(1, -80), pt(2, -50), pt(3, -80)];
    const b = [pt(1, -60), pt(2, -70), pt(3, -80)];
    expect(envelopeOf([a, b]).map((point) => point.level)).toEqual([-60, -50, -80]);
  });

  test('carries the frequency the maximum was read at', () => {
    const a = [pt(1, -80, 1)];
    const b = [pt(1, -60, 1.004)];
    expect(envelopeOf([a, b])[0]?.at).toBe(1.004);
  });

  test('keeps the later trace on a tie, so a line at the end of a range reads its own frequency', () => {
    expect(envelopeOf([[pt(1, -60, 1)], [pt(1, -60 + 1e-12, 1.5)]])[0]?.at).toBe(1.5);
  });

  test('returns nothing for no traces, and does not change its inputs', () => {
    const a = [pt(1, -80)];
    const b = [pt(1, -60)];
    expect(envelopeOf([])).toEqual([]);
    envelopeOf([a, b]);
    expect(a[0]?.level).toBe(-80);
  });
});

const tune = (over: Partial<Extract<HoldEntry, { kind: 'tune' }>> = {}): HoldEntry =>
  ({ kind: 'tune', wave: wave('sine 74MHz -50dBm'), from: 74e6, to: 78e6, step: null, line: 4, ...over });
const waves = (text: string): HoldEntry => ({ kind: 'waves', waves: [wave(text)], line: 3 });
const frequencyOf = (set: readonly { readonly frequency: number | null }[]): (number | null)[] => set.map((one) => one.frequency);

describe('snapshotsOf — 掃引の並びに直す', () => {
  const room = { grid: [], rbw: 100e3, cap: 100 };

  test('keeps an explicit snapshot as it is', () => {
    const { waves: sets } = snapshotsOf([waves('sine 90MHz -50dBm')], room);
    expect(sets).toHaveLength(1);
    expect(frequencyOf(sets[0] ?? [])).toEqual([90e6]);
  });

  test('moves the wave from … to … in the written step, ending exactly on to', () => {
    const { waves: sets } = snapshotsOf([tune({ step: 1.5e6 })], room);
    expect(sets.map((set) => set[0]?.frequency)).toEqual([74e6, 75.5e6, 77e6, 78e6]);
  });

  test('without a step, puts the wave on every sweep point inside the range, plus both ends', () => {
    const grid = [70e6, 72e6, 74.5e6, 76e6, 78e6, 80e6];
    const { waves: sets } = snapshotsOf([tune()], { ...room, grid });
    expect(sets.map((set) => set[0]?.frequency).sort()).toEqual([74e6, 74.5e6, 76e6, 78e6]);
  });

  test('keeps the other shape parameters while moving', () => {
    const { waves: sets } = snapshotsOf([tune({ wave: wave('square 74MHz -50dBm duty 25%') , step: 2e6 })], room);
    expect(sets[1]?.[0]).toMatchObject({ shape: 'square', duty: 0.25, frequency: 76e6 });
  });

  test('says when the step is coarser than the RBW (the peaks will not join)', () => {
    const { said } = snapshotsOf([tune({ step: 1e6 })], room);
    expect(said).toHaveLength(1);
    expect(said[0]).toMatchObject({ notice: true, line: 4 });
    expect(said[0]?.message).toContain('RBW');
  });

  test('says nothing about the step when it is within the RBW', () => {
    expect(snapshotsOf([tune({ step: 50e3, to: 74.2e6 })], room).said).toEqual([]);
  });

  test('stops at the cap and says so', () => {
    const { waves: sets, said } = snapshotsOf([tune({ step: 10e3, to: 80e6 })], { ...room, cap: 10 });
    expect(sets).toHaveLength(10);
    expect(said.some((one) => one.message.includes('10 掃引で打ち切り'))).toBe(true);
  });
});

describe('heldTrace — 今の掃引と積んだ掃引の最大', () => {
  const compute = (set: readonly { readonly frequency: number | null }[]): readonly Point[] =>
    [pt(1, set[0]?.frequency === 1 ? -50 : -90), pt(2, set[0]?.frequency === 2 ? -50 : -90)];

  test('is the maximum over every sweep, including the live trace', () => {
    const sets = [[wave('sine 2Hz 1V')]];
    const held = heldTrace(sets, [pt(1, -40), pt(2, -95)], (set) => compute(set));
    expect(held.map((point) => point.level)).toEqual([-40, -50]);
  });

  test('works with no live trace', () => {
    const held = heldTrace([[wave('sine 1Hz 1V')], [wave('sine 2Hz 1V')]], null, (set) => compute(set));
    expect(held.map((point) => point.level)).toEqual([-50, -50]);
  });
});
