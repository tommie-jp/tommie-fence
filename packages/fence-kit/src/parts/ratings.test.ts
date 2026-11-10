import { describe, expect, test } from 'vitest';
import { ratingWords, readRating, withRatings } from './ratings.ts';

describe('part ratings (i= vf= v=)', () => {
  test('reads each tag on the parts it belongs to', () => {
    expect(readRating('i=3mA', 'led', {})).toEqual({ ok: true, tag: 'i', value: '3mA' });
    expect(readRating('vf=2.0V', 'led', {})).toEqual({ ok: true, tag: 'vf', value: '2.0V' });
    expect(readRating('v=16V', 'capacitor', {})).toEqual({ ok: true, tag: 'v', value: '16V' });
  });

  test('other words are not ratings', () => {
    expect(readRating('red', 'led', {})).toBeNull();
    expect(readRating('l=OLED', 'led', {})).toBeNull();
  });

  test('refuses the wrong part, a missing unit and a second copy', () => {
    expect(readRating('v=16V', 'led', {})).toMatchObject({ ok: false, message: expect.stringContaining('コンデンサ') });
    expect(readRating('i=3mA', 'resistor', {})).toMatchObject({ ok: false, message: expect.stringContaining('LED') });
    expect(readRating('vf=2', 'led', {})).toMatchObject({ ok: false, message: expect.stringContaining('単位') });
    expect(readRating('i=4mA', 'led', { i: '3mA' })).toMatchObject({ ok: false, message: expect.stringContaining('2 回') });
  });

  test('the table value and the written words keep one order', () => {
    expect(withRatings('red', { vf: '2.0V', i: '3mA' })).toBe('red 3mA VF 2.0V');
    expect(withRatings('1000uF', { v: '16V' })).toBe('1000uF 16V');
    expect(withRatings('', { i: '3mA' })).toBe('3mA');
    expect(ratingWords({ vf: '2.0V', i: '3mA' })).toEqual(['i=3mA', 'vf=2.0V']);
  });
});
