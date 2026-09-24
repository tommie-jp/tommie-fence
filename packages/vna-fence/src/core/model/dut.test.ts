import { describe, expect, test } from 'vitest';
import { abs, complex } from './complex.ts';
import { abcdToS, cascade, lineAbcd, seriesZ, terminatedGamma } from './abcd.ts';
import { impedanceOf, sparamAt, sparamsOf, stubImpedance } from './dut.ts';
import type { DutElement } from './dut.ts';
import { logMag, phaseDeg } from './sparams.ts';

/**
 * 期待値は手元の Python (同じ式を numpy の複素数で) で出したもの (52 の docs/76 §3.1)。
 */
const lumped = (place: 'series' | 'shunt', part: 'R' | 'L' | 'C', value: number, extra: Partial<{ esr: number; esl: number; cp: number }> = {}): DutElement =>
  ({ kind: 'lumped', place, part, value, esr: 0, esl: 0, cp: 0, ...extra, line: null });

const db = (elements: readonly DutElement[], f: number): { s21: number; s11: number } => {
  const point = sparamAt(elements, f);
  return { s21: logMag(point.s21 ?? complex(0)), s11: logMag(point.s11 ?? complex(0)) };
};

describe('lumped elements between the two ports', () => {
  test('100 Ω in series gives −6.02 dB both ways and Γ = 0.5', () => {
    const point = sparamAt([lumped('series', 'R', 100)], 10e6);
    expect(logMag(point.s21!)).toBeCloseTo(-6.02, 2);
    expect(point.s11!.re).toBeCloseTo(0.5, 6);
  });

  test('100 Ω in shunt', () => {
    const { s21, s11 } = db([lumped('shunt', 'R', 100)], 10e6);
    expect(s21).toBeCloseTo(-1.94, 2);
    expect(s11).toBeCloseTo(-13.98, 2);
  });

  test('10 pF in series at 100 MHz', () => {
    const point = sparamAt([lumped('series', 'C', 10e-12)], 100e6);
    expect(logMag(point.s21!)).toBeCloseTo(-5.48, 2);
    expect(phaseDeg(point.s21!)).toBeCloseTo(57.86, 1);
  });

  test('100 nH in series at 100 MHz', () => {
    expect(db([lumped('series', 'L', 100e-9)], 100e6).s21).toBeCloseTo(-1.45, 2);
  });

  test('a π low-pass (47p / 100n / 47p)', () => {
    const ladder = [lumped('shunt', 'C', 47e-12), lumped('series', 'L', 100e-9), lumped('shunt', 'C', 47e-12)];
    expect(db(ladder, 10e6).s21).toBeCloseTo(-0.03, 2);
    expect(db(ladder, 100e6).s21).toBeCloseTo(-1.05, 2);
    expect(db(ladder, 200e6).s21).toBeCloseTo(-19.38, 2);
  });

  test('an empty model is a through: S21 = 0 dB and no reflection', () => {
    const point = sparamAt([], 10e6);
    expect(logMag(point.s21!)).toBeCloseTo(0, 6);
    expect(abs(point.s11!)).toBeCloseTo(0, 9);
  });

  test('S12 and S22 of a symmetric element', () => {
    const point = sparamAt([lumped('series', 'R', 100)], 1e6);
    expect(point.s12!.re).toBeCloseTo(0.5, 6);
    expect(point.s22!.re).toBeCloseTo(0.5, 6);
  });
});

describe('parasitics', () => {
  test('ESL makes a capacitor resonate: 10 pF + 1 nH at 1.59 GHz', () => {
    const cap = lumped('series', 'C', 10e-12, { esl: 1e-9, esr: 0.2 }) as Extract<DutElement, { kind: 'lumped' }>;
    const z = impedanceOf(cap, 1.5915e9);
    expect(z.im).toBeCloseTo(0, 0);
    expect(z.re).toBeCloseTo(0.2, 6);
  });

  test('Cp across an inductor makes a parallel resonance', () => {
    const coil = lumped('series', 'L', 1e-6, { cp: 1e-12 }) as Extract<DutElement, { kind: 'lumped' }>;
    // 1 / (2π √(LC)) = 159.2 MHz で |Z| が跳ね上がる
    expect(abs(impedanceOf(coil, 159.15e6))).toBeGreaterThan(1e5);
    expect(abs(impedanceOf(coil, 10e6))).toBeCloseTo(62.9, 0);
  });

  test('a 0 Ω resistor in parallel with Cp stays 0 Ω', () => {
    const wire = lumped('series', 'R', 0, { cp: 1e-12 }) as Extract<DutElement, { kind: 'lumped' }>;
    expect(abs(impedanceOf(wire, 1e6))).toBe(0);
  });
});

describe('lines and stubs', () => {
  const quarter = (z0: number): DutElement => ({ kind: 'line', place: 'series', z0, length: 299_792_458 / 4 / 100e6, vf: 1, end: null, line: null });

  test('a λ/4 75 Ω line between 50 Ω ports reflects 0.385 (−8.30 dB)', () => {
    const point = sparamAt([quarter(75)], 100e6);
    expect(abs(point.s11!)).toBeCloseTo(0.3846, 4);
    expect(logMag(point.s11!)).toBeCloseTo(-8.3, 2);
  });

  test('a λ/4 50 Ω line only turns the phase by −90°', () => {
    const point = sparamAt([quarter(50)], 100e6);
    expect(phaseDeg(point.s21!)).toBeCloseTo(-90, 6);
    expect(logMag(point.s21!)).toBeCloseTo(0, 6);
  });

  test('a shorted λ/4 stub in shunt is open at its frequency (a through)', () => {
    const stub: DutElement = { kind: 'line', place: 'shunt', z0: 50, length: 0.75, vf: 1, end: 'short', line: null };
    // 0.75 m は 99.93 MHz で λ/4
    expect(db([stub], 99.93e6).s21).toBeCloseTo(0, 2);
  });

  test('an open λ/4 stub in shunt shorts the line (a notch)', () => {
    const stub: DutElement = { kind: 'line', place: 'shunt', z0: 50, length: 0.75, vf: 1, end: 'open', line: null };
    expect(db([stub], 99.93e6).s21).toBeLessThan(-40);
  });

  test('a stub in series', () => {
    const stub: DutElement = { kind: 'line', place: 'series', z0: 50, length: 0.75, vf: 1, end: 'short', line: null };
    expect(abs(stubImpedance(stub as Extract<DutElement, { kind: 'line' }>, 10e6))).toBeGreaterThan(0);
    expect(db([stub], 99.93e6).s21).toBeLessThan(-40);
  });
});

describe('one-port models (open / short at the end)', () => {
  test('an open cable reflects everything and has no S21', () => {
    const point = sparamAt([{ kind: 'line', place: 'series', z0: 50, length: 1, vf: 0.66, end: null, line: null }, { kind: 'end', end: 'open', line: null }], 100e6);
    expect(abs(point.s11!)).toBeCloseTo(1, 9);
    expect(point.s21).toBeNull();
  });

  test('a series part then short reads the part itself (Γ of 50 Ω is 0)', () => {
    const point = sparamAt([lumped('series', 'R', 50), { kind: 'end', end: 'short', line: null }], 1e6);
    expect(abs(point.s11!)).toBeCloseTo(0, 9);
  });

  test('only series parts then open is Γ = 1 without dividing by zero', () => {
    expect(terminatedGamma(seriesZ(complex(10)), 'open').re).toBeCloseTo(1, 12);
  });
});

describe('abcd', () => {
  test('cascading a line with itself adds the lengths', () => {
    const half = lineAbcd(50, Math.PI / 4);
    const whole = abcdToS(cascade([half, half]));
    expect(phaseDeg(whole.s21)).toBeCloseTo(-90, 6);
  });

  test('sparamsOf walks the frequencies', () => {
    expect(sparamsOf([lumped('series', 'R', 100)], [1e6, 2e6]).map((point) => point.f)).toEqual([1e6, 2e6]);
  });
});
