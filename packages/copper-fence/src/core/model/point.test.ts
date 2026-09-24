import { describe, expect, test } from 'vitest';
import { formatMm, formatPoint, parseLength, parsePoint, parseSize, pointProblem } from './point.ts';

describe('parsePoint', () => {
  test('reads x,y in millimetres from the top-left corner', () => {
    expect(parsePoint('12.5,4')).toEqual({ x: 12.5, y: 4 });
    expect(parsePoint('0,0')).toEqual({ x: 0, y: 0 });
    expect(parsePoint('-3,20.25')).toEqual({ x: -3, y: 20.25 });
  });

  test('refuses what is not a point, and spellings too long to be one', () => {
    for (const written of ['12', '12,5,4', '12.345,4', '1234,1', 'a,b', '12, 4', '']) {
      expect(parsePoint(written), written).toBeNull();
    }
  });

  test('says why a point-like spelling cannot be read, and stays quiet about others', () => {
    expect(pointProblem('12.345,4')).toMatch(/小数は 2 桁まで/);
    expect(pointProblem('R1')).toBeNull();
  });
});

describe('formatPoint', () => {
  test('drops trailing zeros, so the spelling round-trips', () => {
    expect(formatPoint({ x: 12.5, y: 4 })).toBe('12.5,4');
    expect(formatMm(3.0)).toBe('3');
    expect(formatMm(-0)).toBe('0');
    expect(parsePoint(formatPoint({ x: 0.1 + 0.2, y: 7 }))).toEqual({ x: 0.3, y: 7 });
  });
});

describe('parseLength / parseSize', () => {
  test('reads a positive length with up to three decimals', () => {
    expect(parseLength('3.06')).toBe(3.06);
    expect(parseLength('0.15')).toBe(0.15);
    expect(parseLength('0')).toBeNull();
    expect(parseLength('-1')).toBeNull();
    expect(parseLength('3mm')).toBeNull();
  });

  test('reads a size with or without the unit', () => {
    expect(parseSize('4x4')).toEqual({ width: 4, height: 4 });
    expect(parseSize('20x1mm')).toEqual({ width: 20, height: 1 });
    expect(parseSize('4×2.5')).toEqual({ width: 4, height: 2.5 });
    expect(parseSize('0x4')).toBeNull();
    expect(parseSize('4')).toBeNull();
  });
});
