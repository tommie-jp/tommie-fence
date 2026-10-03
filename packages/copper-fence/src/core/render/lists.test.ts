import { describe, expect, test } from 'vitest';
import type { Board, PartSpec } from '../types.ts';
import { boardRow, partsListing } from './lists.ts';

const board: Board = { width: 40, height: 20, h: 1.6, er: 4.4, ground: 'back', cut: 0.3 };
const part = { id: 'R1', type: 'resistor', variant: null, value: '50' } as PartSpec;

describe('boardRow', () => {
  test('gives size, thickness, permittivity and sides — the defaults included', () => {
    expect(boardRow(board)).toEqual(['基板', 'copper-clad', '40×20mm 1.6mm εr 4.4 両面']);
  });

  test('calls a board with no ground single-sided', () => {
    expect(boardRow({ ...board, ground: 'none' })[2]).toBe('40×20mm 1.6mm εr 4.4 片面');
  });
});

describe('partsListing', () => {
  test('puts the board right under the headings, ahead of the parts in written order', () => {
    expect(partsListing([part], board).map((row) => row[0])).toEqual(['部品', '基板', 'R1']);
  });

  test('prints no table for a board alone', () => {
    expect(partsListing([], board)).toEqual([]);
  });
});
