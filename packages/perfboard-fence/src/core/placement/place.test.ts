import { describe, expect, test } from 'vitest';
import { NO_TURN } from '../parts/orient.ts';
import { placeParts } from './place.ts';
import { createBoard } from '../model/board.ts';
import type { PartSpec } from '../types.ts';

const board = createBoard({ cols: 10, rows: 6 });

const spec = (id: string, holes: readonly string[], line = 1): PartSpec => ({
  id,
  type: 'resistor',
  variant: null,
  written: 'resistor',
  holes,
  value: null,
  turn: NO_TURN,
  line,
});

describe('placeParts', () => {
  test('turns the written holes into addresses', () => {
    const { parts, errors } = placeParts([spec('R1', ['b3', 'b7'])], board);

    expect(errors).toEqual([]);
    expect(parts[0]?.pins.map((pin) => pin.address)).toEqual([
      { row: 2, col: 3 },
      { row: 2, col: 7 },
    ]);
  });

  test('says which end ran off the board, and keeps the rest of the drawing', () => {
    const { parts, errors } = placeParts([spec('R1', ['b3', 'b99']), spec('R2', ['c1', 'c4'])], board);

    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain('b99');
    // **読めた部品は捨てない。** 1 つ落ちたら全部消える図は直しようがない。
    expect(parts.map((part) => part.id)).toEqual(['R2']);
  });

  test('refuses two parts in the same hole, because you cannot solder both', () => {
    const { errors } = placeParts([spec('R1', ['b3', 'b7']), spec('R2', ['b7', 'b9'], 2)], board);

    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain('b7');
    expect(errors[0]?.line).toBe(2);
  });

  test('refuses a part whose two ends are the same hole', () => {
    const { errors } = placeParts([spec('R1', ['b3', 'b3'])], board);

    expect(errors[0]?.message).toContain('同じ穴');
  });

  test('refuses two parts with the same id, so a wire cannot mean two things', () => {
    const { parts, errors } = placeParts([spec('R1', ['b3', 'b7']), spec('R1', ['c1', 'c4'], 2)], board);

    expect(errors[0]?.message).toContain('R1');
    expect(parts).toHaveLength(1);
  });

  test('stops at the limit instead of drawing a board no one can read', () => {
    // 穴を重ねると衝突で先に落ちてしまうので、1 つずつ別の穴に置く。
    const big = createBoard({ cols: 120, rows: 20 });
    const many = Array.from({ length: 400 }, (_, i) => {
      const row = String.fromCharCode('a'.charCodeAt(0) + Math.floor(i / 50));
      const col = (i % 50) * 2 + 1;
      return spec(`R${i}`, [`${row}${col}`, `${row}${col + 1}`]);
    });

    const { parts, errors } = placeParts(many, big);

    expect(parts).toHaveLength(200);
    expect(errors.some((e) => e.message.includes('多すぎ'))).toBe(true);
  });
});

describe('端面実装の凹の先端', () => {
  const sma = (holes: readonly string[]): PartSpec => ({
    id: 'J1', type: 'sma', variant: 'female-edge', written: 'sma/female-edge', holes, value: null, turn: NO_TURN, line: 4,
  });

  test('fills in the tip that was left out', () => {
    const { parts, errors } = placeParts([sma(['c1', 'd0'])], board);

    expect(errors).toEqual([]);
    expect(parts[0]?.pins).toHaveLength(3);
  });

  test('refuses a tip written on the centre line, pointing at the line', () => {
    // 実物の腕は中心導体を上下から挟んでいて、中心線には来ない。
    const { parts, errors } = placeParts([sma(['c1', 'c0'])], board);

    expect(parts).toEqual([]);
    expect(errors[0]?.message).toContain('上下の行');
    expect(errors[0]?.line).toBe(4);
  });
});

