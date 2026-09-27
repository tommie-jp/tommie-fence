import { describe, expect, test } from 'vitest';
import { fft, fftArrays, kaiser, nextPowerOfTwo } from './dsp.ts';

describe('fft', () => {
  test('inverse: a single frequency line becomes a rotating phasor of 1/n', () => {
    const n = 8;
    const input = Array.from({ length: n }, (_, index) => (index === 1 ? { re: 1, im: 0 } : { re: 0, im: 0 }));
    const out = fft(input, 'inverse');
    expect(out[0]?.re).toBeCloseTo(1 / n, 12);
    expect(out[2]?.im).toBeCloseTo(1 / n, 12);
  });

  test('forward: a cosine of k cycles lands on bins k and n − k, each n/2', () => {
    const n = 16;
    const k = 3;
    const input = Array.from({ length: n }, (_, index) => ({ re: Math.cos((2 * Math.PI * k * index) / n), im: 0 }));
    const out = fft(input, 'forward');
    expect(out[k]?.re).toBeCloseTo(n / 2, 9);
    expect(out[n - k]?.re).toBeCloseTo(n / 2, 9);
    expect(Math.hypot(out[1]?.re ?? 0, out[1]?.im ?? 0)).toBeCloseTo(0, 9);
  });

  test('forward then inverse gives the input back', () => {
    const input = [1, -2, 3.5, 0, 0.25, 7, -1, 2].map((re, index) => ({ re, im: index / 10 }));
    const back = fft(fft(input, 'forward'), 'inverse');
    back.forEach((value, index) => {
      expect(value.re).toBeCloseTo(input[index]?.re ?? 0, 12);
      expect(value.im).toBeCloseTo(input[index]?.im ?? 0, 12);
    });
  });

  test('does not touch its input', () => {
    const input = [{ re: 1, im: 0 }, { re: 0, im: 0 }];
    fft(input, 'inverse');
    expect(input).toEqual([{ re: 1, im: 0 }, { re: 0, im: 0 }]);
    const real = Float64Array.from([1, 2]);
    fftArrays(real, new Float64Array(2), 'forward');
    expect([...real]).toEqual([1, 2]);
  });
});

describe('kaiser', () => {
  test('is 1 in the middle and small at the edges', () => {
    const window = kaiser(101, 6);
    expect(window[50]).toBeCloseTo(1, 9);
    expect(window[0]).toBeLessThan(0.1);
    expect(kaiser(1, 6)).toEqual([1]);
  });
});

describe('nextPowerOfTwo', () => {
  test('rounds up to a power of two', () => {
    expect([1, 2, 3, 1000, 1024, 1025].map(nextPowerOfTwo)).toEqual([1, 2, 4, 1024, 1024, 2048]);
  });
});
