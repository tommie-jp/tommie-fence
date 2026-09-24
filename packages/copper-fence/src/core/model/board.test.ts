import { describe, expect, test } from 'vitest';
import {
  DEFAULT_BOARD, createBoard, describeBoard, edgePoint, farFromBoard, hasBackGround, hasFrontGround, inward, isOnBoard,
  resolveSize,
} from './board.ts';

describe('resolveSize', () => {
  test('reads millimetres and centimetres', () => {
    expect(resolveSize('40x20mm')).toEqual({ ok: true, width: 40, height: 20 });
    expect(resolveSize('4x2cm')).toEqual({ ok: true, width: 40, height: 20 });
    expect(resolveSize('40 × 20 mm')).toEqual({ ok: true, width: 40, height: 20 });
  });

  test('wants the unit, because 40x20 means holes on a perfboard', () => {
    const read = resolveSize('40x20');

    expect(read.ok).toBe(false);
    expect(!read.ok && read.reason).toMatch(/単位を付けます \(40x20mm\)/);
  });

  test('refuses boards too small for a connector or too big to draw', () => {
    expect(resolveSize('3x20mm').ok).toBe(false);
    expect(resolveSize('300x20mm').ok).toBe(false);
    expect(resolveSize('big').ok).toBe(false);
  });
});

describe('the default board', () => {
  test('is the 40x20mm FR4 of the jig chapter, with the ground on the back', () => {
    expect(DEFAULT_BOARD).toEqual({ width: 40, height: 20, h: 1.6, er: 4.4, ground: 'back', cut: 0.5 });
    expect(describeBoard(DEFAULT_BOARD)).toBe('40×20 mm  h 1.6  εr 4.4  裏: ベタ GND');
  });
});

describe('ground', () => {
  test('tells which sides carry the ground', () => {
    const on = (ground: 'back' | 'front' | 'both' | 'none') => createBoard(40, 20, { ground });

    expect([hasFrontGround(on('back')), hasBackGround(on('back'))]).toEqual([false, true]);
    expect([hasFrontGround(on('front')), hasBackGround(on('front'))]).toEqual([true, false]);
    expect([hasFrontGround(on('both')), hasBackGround(on('both'))]).toEqual([true, true]);
    expect([hasFrontGround(on('none')), hasBackGround(on('none'))]).toEqual([false, false]);
  });
});

describe('edges', () => {
  test('puts a point on each side and points inward from it', () => {
    expect(edgePoint(DEFAULT_BOARD, 'left', 10)).toEqual({ x: 0, y: 10 });
    expect(edgePoint(DEFAULT_BOARD, 'right', 10)).toEqual({ x: 40, y: 10 });
    expect(edgePoint(DEFAULT_BOARD, 'top', 5)).toEqual({ x: 5, y: 0 });
    expect(edgePoint(DEFAULT_BOARD, 'bottom', 5)).toEqual({ x: 5, y: 20 });
    expect(inward('right')).toEqual({ x: -1, y: 0 });
    expect(inward('bottom')).toEqual({ x: 0, y: -1 });
  });

  test('knows the board and how far past it a note may reach', () => {
    expect(isOnBoard(DEFAULT_BOARD, { x: 40, y: 20 })).toBe(true);
    expect(isOnBoard(DEFAULT_BOARD, { x: 40.1, y: 20 })).toBe(false);
    expect(farFromBoard(DEFAULT_BOARD, { x: -20, y: 0 })).toBeNull();
    expect(farFromBoard(DEFAULT_BOARD, { x: -21, y: 0 })).toMatch(/離れすぎ/);
  });
});
