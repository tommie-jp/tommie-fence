import { describe, expect, test } from 'vitest';
import { createLayout } from '../model/layout.ts';
import { createBoard } from '../model/board.ts';
import { renderHits } from './hits.ts';

const hits = (
  size: { cols: number; rows: number } = { cols: 6, rows: 4 },
  used: readonly string[] = [],
  names: ReadonlyMap<string, string> = new Map(),
) => {
  const board = createBoard(size);
  return renderHits(board, createLayout(board), new Set(used), names);
};

describe('renderHits', () => {
  test('lays a cell over every hole, named by its address', () => {
    const svg = hits();

    expect(svg.match(/class="cf-cell"/g)).toHaveLength(6 * 4);
    expect(svg).toContain('data-address="a1"');
    expect(svg).toContain('data-address="d6"');
  });

  test('keeps the cells invisible, since the drawing is the map', () => {
    expect(hits({ cols: 2, rows: 2 })).toContain('fill="transparent"');
  });

  test('puts a dot only on the holes something is written at', () => {
    const svg = hits({ cols: 6, rows: 4 }, ['a1', 'b2']);

    expect(svg.match(/class="cf-dot"/g)).toHaveLength(2);
    expect(svg).toContain('data-node="a1"');
    expect(svg).not.toContain('data-node="c3"');
  });

  test('carries the name of a hole that points: has named', () => {
    expect(hits({ cols: 6, rows: 4 }, ['a1'], new Map([['a1', 'IN']]))).toContain('data-name="IN"');
  });

  test('separates what is grabbed from where things are dropped', () => {
    const svg = hits({ cols: 2, rows: 2 }, ['a1']);

    expect(svg).toContain('<g class="cf-hits">');
    expect(svg).toContain('<g class="cf-marks">');
  });

  test('escapes a name, which comes from the fence', () => {
    expect(hits({ cols: 2, rows: 2 }, ['a1'], new Map([['a1', '<b>']]))).toContain('&lt;b&gt;');
  });
});
