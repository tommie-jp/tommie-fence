import { describe, expect, test } from 'vitest';
import { crossingOf, headingOf, isInside, lengthInside, penetration, segmentsOf } from './geometry.ts';

const box = (cx: number, cy: number, width: number, height: number, angle = 0) => ({ cx, cy, width, height, angle });
const seg = (x1: number, y1: number, x2: number, y2: number) => ({ from: { x: x1, y: y1 }, to: { x: x2, y: y2 } });

describe('penetration', () => {
  test('returns the shorter side of the overlap for axis-aligned boxes', () => {
    expect(penetration(box(0, 0, 20, 10), box(15, 0, 20, 10))).toBeCloseTo(5);
  });

  test('is 0 when the boxes only touch', () => {
    expect(penetration(box(0, 0, 20, 10), box(20, 0, 20, 10))).toBe(0);
  });

  test('sees rotated boxes apart where their bounding boxes would overlap', () => {
    const tilted = box(0, 0, 40, 4, Math.PI / 4);
    expect(penetration(tilted, box(14, -14, 6, 6))).toBe(0);
  });

  test('is 0 for an empty box', () => {
    expect(penetration(box(0, 0, 0, 10), box(0, 0, 10, 10))).toBe(0);
  });
});

describe('lengthInside', () => {
  test('measures the part of a segment that runs through a box', () => {
    expect(lengthInside(seg(-50, 0, 50, 0), box(0, 0, 20, 10))).toBeCloseTo(20);
  });

  test('is 0 for a segment that passes by', () => {
    expect(lengthInside(seg(-50, 20, 50, 20), box(0, 0, 20, 10))).toBe(0);
  });

  test('follows the rotation of the box', () => {
    expect(lengthInside(seg(-50, -50, 50, 50), box(0, 0, 20, 4, Math.PI / 4))).toBeCloseTo(20);
  });
});

describe('crossingOf', () => {
  test('finds a plus-shaped crossing', () => {
    expect(crossingOf(seg(-10, 0, 10, 0), seg(0, -10, 0, 10))).toEqual({ x: 0, y: 0 });
  });

  test('ignores a T (one segment ends on the other)', () => {
    expect(crossingOf(seg(-10, 0, 10, 0), seg(0, 0, 0, 10))).toBeNull();
  });

  test('ignores segments that share an end', () => {
    expect(crossingOf(seg(0, 0, 10, 0), seg(0, 0, 0, 10))).toBeNull();
  });

  test('ignores parallel segments', () => {
    expect(crossingOf(seg(0, 0, 10, 0), seg(0, 5, 10, 5))).toBeNull();
  });
});

describe('helpers', () => {
  test('segmentsOf drops zero-length pieces', () => {
    expect(segmentsOf([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 }])).toHaveLength(1);
  });

  test('isInside is true only between the ends', () => {
    expect(isInside({ x: 5, y: 0 }, seg(0, 0, 10, 0))).toBe(true);
    expect(isInside({ x: 0, y: 0 }, seg(0, 0, 10, 0))).toBe(false);
    expect(isInside({ x: 5, y: 3 }, seg(0, 0, 10, 0))).toBe(false);
    expect(isInside({ x: 15, y: 0 }, seg(0, 0, 10, 0))).toBe(false);
  });

  test('headingOf gives whole degrees from 0 to 359', () => {
    expect(headingOf({ x: 0, y: 0 }, { x: 10, y: 0 })).toBe(0);
    expect(headingOf({ x: 0, y: 0 }, { x: 0, y: -10 })).toBe(270);
  });
});
