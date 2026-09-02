import { describe, expect, test } from 'vitest';
import { parseAddress } from '../model/address.ts';
import type { Address } from '../types.ts';
import { aimAt, fenceAt } from './map.ts';
import { movePart, movablePartIds, partSpans } from './move.ts';
import { movableNodes, movePoint, nodeSpans } from './point.ts';
import { applyEdits } from './shared.ts';

const at = (text: string): Address => {
  const address = parseAddress(text);
  if (address === null) throw new Error(`番地ではありません: ${text}`);
  return address;
};

const BOARD = `board: 12x7
points:
  IN: a1
parts:
  R1: resistor b2 b6 10k
  C1: capacitor b8 b11 100n
wires:
  - IN -- a2
  - a2 -- b2
`;

const moved = (source: string, id: string, to: string): string => {
  const result = movePart(source, id, at(to));
  if (!result.ok) throw new Error(result.error.message);
  return applyEdits(source, result.value.edits);
};

const carried = (source: string, from: string, to: string): string => {
  const result = movePoint(source, at(from), at(to));
  if (!result.ok) throw new Error(result.error.message);
  return applyEdits(source, result.value.edits);
};

describe('movePart', () => {
  test('carries every hole of a part by the same step', () => {
    expect(moved(BOARD, 'R1', 'c2')).toContain('R1: resistor c2 c6 10k');
  });

  test('moves along the columns too', () => {
    expect(moved(BOARD, 'R1', 'b3')).toContain('R1: resistor b3 b7 10k');
  });

  test('leaves the value, the name and everything else alone', () => {
    const after = moved(BOARD, 'R1', 'c2');

    expect(after).toContain('C1: capacitor b8 b11 100n');
    expect(after).toContain('  IN: a1');
  });

  test('says nothing changed when it is already there', () => {
    expect(movePart(BOARD, 'R1', at('b2')).ok && movePart(BOARD, 'R1', at('b2')).ok).toBe(true);
    const result = movePart(BOARD, 'R1', at('b2'));

    expect(result.ok && result.value.edits).toEqual([]);
  });

  test('refuses to walk off the board, naming the hole that fell off', () => {
    // 12x7 の板。b6 が b13 になる移動は板の外。
    const result = movePart(BOARD, 'R1', at('b9'));

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message).toContain('板の外');
  });

  test('refuses a part it cannot find', () => {
    expect(!movePart(BOARD, 'X9', at('a1')).ok).toBe(true);
  });

  test('goes there and back again, leaving the fence as it was', () => {
    const there = moved(BOARD, 'R1', 'd3');
    const back = movePart(there, 'R1', at('b2'));

    expect(back.ok && applyEdits(there, back.value.edits)).toBe(BOARD);
  });

  test('tells which connections came apart', () => {
    // b2 には配線が来ている。離れれば接続が切れる (全穴が独立しているので必ず出る)。
    const result = movePart(BOARD, 'R1', at('d2'));

    expect(result.ok && result.value.diff.lost.length).toBeGreaterThan(0);
  });
});

describe('movablePartIds / partSpans', () => {
  test('lists the parts that can be grabbed', () => {
    expect(movablePartIds(BOARD)).toEqual(['R1', 'C1']);
  });

  test('points at every hole of the part, for the editor to light up', () => {
    const spans = partSpans(BOARD, 'R1');

    expect(spans).toHaveLength(2);
    expect(spans[0]).toMatchObject({ line: 5, length: 2 });
  });
});

describe('movePoint', () => {
  test('moves a named hole by its one line, and the rest follows', () => {
    const after = carried(BOARD, 'a1', 'a3');

    expect(after).toContain('  IN: a3');
    expect(after).toContain('- IN -- a2');
  });

  test('moves every place a nameless hole is written', () => {
    const after = carried(BOARD, 'b2', 'c2');

    expect(after).toContain('R1: resistor c2 b6 10k');
    expect(after).toContain('- a2 -- c2');
  });

  test('refuses a move that would collapse a part onto one hole', () => {
    const result = movePoint(BOARD, at('b2'), at('b6'));

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message).toContain('R1');
  });

  test('refuses to walk off the board', () => {
    expect(movePoint(BOARD, at('b2'), at('b99')).ok).toBe(false);
  });

  test('says so when nothing is written at that hole', () => {
    expect(!movePoint(BOARD, at('g12'), at('g11')).ok).toBe(true);
  });

  test('goes there and back again', () => {
    const there = carried(BOARD, 'b2', 'd2');
    const back = movePoint(there, at('d2'), at('b2'));

    expect(back.ok && applyEdits(there, back.value.edits)).toBe(BOARD);
  });
});

describe('movableNodes / nodeSpans', () => {
  test('lists every hole something is written at, with its name', () => {
    const nodes = movableNodes(BOARD);

    expect(nodes.find((node) => node.name === 'IN')?.address).toEqual(at('a1'));
  });

  test('counts how many places write the hole', () => {
    // b2 は R1 の足と配線の端の 2 か所。
    expect(movableNodes(BOARD).find((node) => node.address.row === 2 && node.address.col === 2)?.uses).toBe(2);
  });

  test('points at every place the hole is written', () => {
    expect(nodeSpans(BOARD, at('b2'))).toHaveLength(2);
  });
});

describe('fenceAt / aimAt', () => {
  const NOTE = ['# ノート', '', '```perfboard', ...BOARD.split('\n'), '```', ''].join('\n');

  test('finds the fence the cursor sits in', () => {
    expect(fenceAt(NOTE, 6)?.line).toBe(3);
  });

  test('is null outside every fence', () => {
    expect(fenceAt(NOTE, 1)).toBeNull();
  });

  test('points at the part when the cursor is on its line', () => {
    expect(aimAt(BOARD, 5, 4)).toEqual({ kind: 'part', id: 'R1' });
  });

  test('points at the hole when the cursor is on the address itself', () => {
    const line = '  R1: resistor b2 b6 10k';

    expect(aimAt(BOARD, 5, line.indexOf('b6'))).toEqual({ kind: 'node', id: 'b6' });
  });

  test('points at the wire by its line, since one line is one path', () => {
    expect(aimAt(BOARD, 8, 2)).toEqual({ kind: 'wire', id: '8' });
  });

  test('points at the hole a points: line gives a name to', () => {
    expect(aimAt(BOARD, 3, 2)).toEqual({ kind: 'node', id: 'a1' });
  });
});
