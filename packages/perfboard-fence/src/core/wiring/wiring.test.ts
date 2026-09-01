import { describe, expect, test } from 'vitest';
import { netlistOf, resolveWires } from './wiring.ts';
import { createBoard } from '../model/board.ts';
import { parseAddress } from '../model/address.ts';
import { holeStrip } from '../model/board.ts';
import type { PlacedPart, WireSpec } from '../types.ts';

const board = createBoard({ cols: 10, rows: 6 });

const wire = (from: string, to: string, line = 1): WireSpec => ({ from, to, color: null, line });

const part = (id: string, holes: readonly string[]): PlacedPart => ({
  id,
  type: 'resistor',
  variant: null,
  value: null,
  line: null,
  pins: holes.map((hole) => {
    const address = parseAddress(hole)!;
    return { address, strip: holeStrip(address) };
  }),
});

describe('resolveWires', () => {
  test('turns the written ends into addresses', () => {
    const { wires, errors } = resolveWires([wire('b3', 'c5')], new Map(), board);

    expect(errors).toEqual([]);
    expect(wires[0]?.from).toEqual({ row: 2, col: 3 });
    expect(wires[0]?.to).toEqual({ row: 3, col: 5 });
  });

  test('looks a name up in points:', () => {
    const points = new Map([['VCC', parseAddress('a1')!]]);
    const { wires, errors } = resolveWires([wire('VCC', 'b3')], points, board);

    expect(errors).toEqual([]);
    expect(wires[0]?.from).toEqual({ row: 1, col: 1 });
  });

  test('says which end it could not read, and keeps the other wires', () => {
    const { wires, errors } = resolveWires([wire('nosuch', 'b3'), wire('c1', 'c4', 2)], new Map(), board);

    expect(errors).toHaveLength(1);
    expect(errors[0]?.token).toBe('nosuch');
    expect(wires).toHaveLength(1);
  });

  test('says an end that is off the board is off the board', () => {
    const { errors } = resolveWires([wire('b3', 'b99')], new Map(), board);

    expect(errors[0]?.message).toContain('b99');
  });

  test('refuses a wire whose two ends are the same hole', () => {
    const { errors } = resolveWires([wire('b3', 'b3')], new Map(), board);

    expect(errors[0]?.message).toContain('同じ穴');
  });

  test('stops at the limit', () => {
    const many = Array.from({ length: 600 }, () => wire('b3', 'c5'));

    expect(resolveWires(many, new Map(), board).errors.some((e) => e.message.includes('多すぎ'))).toBe(true);
  });
});

describe('netlistOf', () => {
  test('joins the pins a wire connects', () => {
    const parts = [part('R1', ['b3', 'b7']), part('R2', ['c5', 'c9'])];
    const { wires } = resolveWires([wire('b7', 'c5')], new Map(), board);

    const joined = netlistOf(parts, wires, []).find((net) => net.refs.length === 2);

    expect([...(joined?.refs ?? [])].sort()).toEqual(['R1.2', 'R2.1']);
  });

  test('leaves an unwired pin as a net of its own, because every hole is independent', () => {
    // **ここがブレッドボードとの分かれ目。** あちらは列が最初から導通していて、
    // 同じ列に挿しただけで 1 つのネットになる。
    expect(netlistOf([part('R1', ['b3', 'b7'])], [], [])).toHaveLength(2);
  });

  test('uses a name from points: for the net', () => {
    const nets = netlistOf([part('R1', ['b3', 'b7'])], [], [[parseAddress('b3')!, 'VCC']]);

    expect(nets.map((net) => net.name)).toContain('VCC');
  });

  test('numbers the nets no one named', () => {
    const names = netlistOf([part('R1', ['b3', 'b7'])], [], []).map((net) => net.name);

    expect(names.sort()).toEqual(['N1', 'N2']);
  });
});
