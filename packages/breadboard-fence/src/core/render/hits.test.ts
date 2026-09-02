import { describe, expect, test } from 'vitest';
import { createLayout } from '../model/layout.ts';
import { DEFAULT_BOARD, RAIL_ROWS } from '../types.ts';
import type { Board } from '../types.ts';
import { renderHits } from './hits.ts';

const boardOf = (over: Partial<Board> = {}): Board => ({ ...DEFAULT_BOARD, columns: 30, ...over });

const hits = (over: Partial<Board> = {}, used: readonly string[] = [], names: ReadonlyMap<string, string> = new Map()) => {
  const board = boardOf(over);
  return renderHits(board, createLayout(board), new Set(used), names);
};

describe('renderHits', () => {
  test('lays a cell over every hole, named by its address', () => {
    const svg = hits({ columns: 3 });

    // 10 行 × 3 列 + レール 4 本 × 3 列。
    expect(svg.match(/class="cf-cell"/g)).toHaveLength(10 * 3 + 4 * 3);
    expect(svg).toContain('data-address="a1"');
    expect(svg).toContain('data-address="j3"');
  });

  test('names the rails the way they are written', () => {
    expect(hits({ columns: 2 })).toContain('data-address="+t1"');
    expect(hits({ columns: 2 })).toContain('data-address="-b2"');
  });

  test('leaves the rails out of a board that has none', () => {
    const svg = hits({ columns: 2, rails: null });

    expect(svg.match(/class="cf-cell"/g)).toHaveLength(10 * 2);
    expect(svg).not.toContain('data-address="+t1"');
  });

  test('keeps the cells invisible, since the drawing is the map', () => {
    // 掴むための層であって、見せるための層ではない。
    expect(hits({ columns: 1 })).toContain('fill="transparent"');
  });

  test('puts a dot only on the holes something is written at', () => {
    const svg = hits({ columns: 3 }, ['a1', 'b2']);

    expect(svg.match(/class="cf-dot"/g)).toHaveLength(2);
    expect(svg).toContain('data-node="a1"');
    expect(svg).not.toContain('data-node="c3"');
  });

  test('carries the name of a hole that points: has named', () => {
    const svg = hits({ columns: 3 }, ['a1'], new Map([['a1', 'vin']]));

    expect(svg).toContain('data-node="a1"');
    expect(svg).toContain('data-name="vin"');
  });

  test('separates what is grabbed from where things are dropped', () => {
    // 部品の升にも節点は立つ。どちらも掴めると、掴んだつもりと違うものが動く。
    const svg = hits({ columns: 2 }, ['a1']);

    expect(svg).toContain('<g class="cf-hits">');
    expect(svg).toContain('<g class="cf-marks">');
  });

  test('escapes a name, which comes from the fence', () => {
    expect(hits({ columns: 2 }, ['a1'], new Map([['a1', '<b>']]))).toContain('&lt;b&gt;');
  });

  test('covers the rails in the order the board carries them', () => {
    // 並びが変わると穴の位置も変わる。番地と座標が食い違うと掴めない。
    const swapped = hits({ columns: 1, rails: [...RAIL_ROWS].reverse() as unknown as Board['rails'] });

    expect(swapped).toContain('data-address="+b1"');
    expect(swapped).toContain('data-address="+t1"');
  });
});
