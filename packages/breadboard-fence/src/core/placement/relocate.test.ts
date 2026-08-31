import { describe, expect, test } from 'vitest';
import { createBoard } from '../model/board.ts';
import { formatAddress, parseAddress } from '../model/address.ts';
import type { HoleAddress, PartSpec } from '../types.ts';
import { placeParts } from './place.ts';
import { relocateParts } from './relocate.ts';
import type { WireEnd } from './relocate.ts';

const board = createBoard('half');

const spec = (over: Partial<PartSpec> & Pick<PartSpec, 'id' | 'type'>): PartSpec => ({
  written: over.type,
  holes: [],
  value: null,
  label: null,
  at: null,
  pins: null,
  variant: null,
  line: 1,
  ...over,
});

const holes = (...addresses: string[]) => addresses.map((addr, index) => ({ addr, tag: String(index + 1) }));

const place = (...specs: PartSpec[]) => {
  const placed = placeParts(specs, board);
  expect(placed.errors).toEqual([]);
  return placed.parts;
};

const end = (
  addr: string,
  exit: WireEnd['exit'],
  away: WireEnd['away'] = exit === 'up' ? 'down' : exit === 'down' ? 'up' : null,
): WireEnd => ({ address: parseAddress(addr) as HoleAddress, exit, away });

const pinsOf = (part: { pins: readonly { address: unknown }[] }) =>
  part.pins.map((pin) => (pin.address ? formatAddress(pin.address as never) : null));

describe('relocateParts', () => {
  test('moves a bottom-row part up when the wire leaves downward', () => {
    // 図07 の形: Re の足と配線が j20 を取り合い、配線は下のレールへ出る。
    const parts = place(spec({ id: 'Re', type: 'resistor', holes: holes('j17', 'j20') }));

    const { parts: moved, errors } = relocateParts(parts, [end('j20', 'down')]);

    expect(errors).toEqual([]);
    expect(pinsOf(moved[0]!)).toEqual(['i17', 'i20']);
  });

  test('moves a top-row part down when the wire leaves upward', () => {
    const parts = place(spec({ id: 'R1', type: 'resistor', holes: holes('a5', 'a10') }));

    const { parts: moved, errors } = relocateParts(parts, [end('a5', 'up')]);

    expect(errors).toEqual([]);
    expect(pinsOf(moved[0]!)).toEqual(['b5', 'b10']);
  });

  test('a sideways hop does not veto the direction a riser dictates', () => {
    // 01-led の R1 の形: a5 は上のレールへ登り、a10 は斜め下の b12 へ逃げる。
    // 斜めの配線は列に留まらないので、下へ寄せても踏まない。
    const parts = place(spec({ id: 'R1', type: 'resistor', holes: holes('a5', 'a10') }));

    const { parts: moved, errors } = relocateParts(parts, [end('a5', 'up'), end('a10', 'none', 'down')]);

    expect(errors).toEqual([]);
    expect(pinsOf(moved[0]!)).toEqual(['b5', 'b10']);
  });

  test('sideways hops alone try the nicer side first and fall back', () => {
    // 06-switches の R1 の形: j10 から斜め上の i12 へ。遠ざかる側 (下) は
    // ブロックの外なので、上へ寄る。
    const parts = place(spec({ id: 'R1', type: 'resistor', holes: holes('j5', 'j10') }));

    const { parts: moved, errors } = relocateParts(parts, [end('j10', 'none', 'down')]);

    expect(errors).toEqual([]);
    expect(pinsOf(moved[0]!)).toEqual(['i5', 'i10']);
  });

  test('slides past an occupied row to the next free one', () => {
    const parts = place(
      spec({ id: 'R1', type: 'resistor', holes: holes('a5', 'a10') }),
      spec({ id: 'R2', type: 'resistor', holes: holes('b5', 'b8') }),
    );

    const { parts: moved, errors } = relocateParts(parts, [end('a5', 'up')]);

    expect(errors).toEqual([]);
    expect(pinsOf(moved[0]!)).toEqual(['c5', 'c10']);
    expect(pinsOf(moved[1]!)).toEqual(['b5', 'b8']);
  });

  test('does not land on a hole another wire connects to', () => {
    const parts = place(spec({ id: 'R1', type: 'resistor', holes: holes('a5', 'a10') }));

    const { parts: moved, errors } = relocateParts(parts, [end('a5', 'up'), end('b10', 'none')]);

    expect(errors).toEqual([]);
    expect(pinsOf(moved[0]!)).toEqual(['c5', 'c10']);
  });

  test('does not land in the corridor of a riser', () => {
    // 01-led の D1 の形: c13 から上のレールへ登る配線が b13, a13 の上を通るので、
    // そこには寄せない。c13 自体も配線の穴なので、d 行まで滑る。
    const parts = place(spec({ id: 'D1', type: 'led', holes: holes('b12', 'b13') }));

    const { parts: moved, errors } = relocateParts(parts, [
      end('b12', 'none', 'down'),
      end('c13', 'up'),
    ]);

    expect(errors).toEqual([]);
    expect(pinsOf(moved[0]!)).toEqual(['d12', 'd13']);
  });

  test('gives up when risers fence in every free row', () => {
    // j10 からブロックを登り切る配線が f10〜i10 の上を通り、寄せ先を全部塞ぐ。
    const parts = place(spec({ id: 'R1', type: 'resistor', holes: holes('g5', 'g10') }));

    const { parts: moved, errors } = relocateParts(parts, [
      end('g5', 'none', 'down'),
      end('j10', 'up'),
    ]);

    expect(pinsOf(moved[0]!)).toEqual(['g5', 'g10']);
    expect(errors).toHaveLength(1);
  });

  test('later parts see the ledger updated by earlier moves', () => {
    const parts = place(
      spec({ id: 'R1', type: 'resistor', holes: holes('a5', 'a10') }),
      spec({ id: 'D1', type: 'led', holes: holes('b12', 'b13') }),
    );

    const { parts: moved, errors } = relocateParts(parts, [
      end('a5', 'up'),
      end('a10', 'up'),
      end('b12', 'up'),
    ]);

    expect(errors).toEqual([]);
    expect(pinsOf(moved[0]!)).toEqual(['b5', 'b10']);
    expect(pinsOf(moved[1]!)).toEqual(['c12', 'c13']);
  });

  test('moves a three lead part as one rigid piece', () => {
    const parts = place(spec({ id: 'Q1', type: 'transistor', holes: holes('b12', 'b13', 'b14') }));

    const { parts: moved, errors } = relocateParts(parts, [end('b13', 'up')]);

    expect(errors).toEqual([]);
    expect(pinsOf(moved[0]!)).toEqual(['c12', 'c13', 'c14']);
  });

  test('leaves parts alone when no wire shares their holes', () => {
    const parts = place(spec({ id: 'R1', type: 'resistor', holes: holes('a5', 'a10') }));

    const { parts: moved, errors } = relocateParts(parts, [end('b5', 'up')]);

    expect(errors).toEqual([]);
    expect(moved).toBe(parts);
  });

  test('does not mutate the input when a part moves', () => {
    const parts = place(spec({ id: 'R1', type: 'resistor', holes: holes('a5', 'a10') }));

    const { parts: moved } = relocateParts(parts, [end('a5', 'up')]);

    expect(pinsOf(parts[0]!)).toEqual(['a5', 'a10']);
    expect(moved[0]).not.toBe(parts[0]);
  });

  test('reports and stays when the block has no free row', () => {
    // f は下ブロックの最上行なので、上へは寄せられない。
    const parts = place(spec({ id: 'R1', type: 'resistor', holes: holes('f5', 'f10'), line: 7 }));

    const { parts: moved, errors } = relocateParts(parts, [end('f5', 'down')]);

    expect(pinsOf(moved[0]!)).toEqual(['f5', 'f10']);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.notice).toBe(true);
    expect(errors[0]?.line).toBe(7);
    expect(errors[0]?.message).toContain('f5');
  });

  test('does not slide under a covering body', () => {
    // タクトスイッチの本体の下 (e6, f6) は空きに数えない。下は配線の通り道で禁止、
    // 上は f6 が本体の下でその先はブロックの外。寄せ先が無いので諦める。
    const parts = place(
      spec({ id: 'S1', type: 'button', holes: holes('e5') }),
      spec({ id: 'R1', type: 'resistor', holes: holes('g6', 'g10') }),
    );

    const { parts: moved, errors } = relocateParts(parts, [end('g6', 'down')]);

    expect(pinsOf(moved[1]!)).toEqual(['g6', 'g10']);
    expect(errors).toHaveLength(1);
  });

  test('gives up when wires run vertically on both sides', () => {
    const parts = place(spec({ id: 'R1', type: 'resistor', holes: holes('b5', 'b10') }));

    const { parts: moved, errors } = relocateParts(parts, [end('b5', 'up'), end('b10', 'down')]);

    expect(pinsOf(moved[0]!)).toEqual(['b5', 'b10']);
    expect(errors).toHaveLength(1);
  });

  test('gives up when the exit direction is unknown', () => {
    const parts = place(spec({ id: 'R1', type: 'resistor', holes: holes('b5', 'b10') }));

    const { parts: moved, errors } = relocateParts(parts, [end('b5', 'unknown')]);

    expect(pinsOf(moved[0]!)).toEqual(['b5', 'b10']);
    expect(errors).toHaveLength(1);
  });

  test('reports a shared hole on a part it cannot slide', () => {
    const parts = place(spec({ id: 'U1', type: 'dip8', holes: holes('e5') }));

    const { parts: moved, errors } = relocateParts(parts, [end('e5', 'up')]);

    expect(moved).toBe(parts);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.notice).toBe(true);
  });

  test('reports a shared hole on a part with a rail lead', () => {
    const parts = place(spec({ id: 'Re', type: 'resistor', holes: holes('j11', '-b11') }));

    const { parts: moved, errors } = relocateParts(parts, [end('j11', 'down')]);

    expect(pinsOf(moved[0]!)).toEqual(['j11', '-b11']);
    expect(errors).toHaveLength(1);
  });

  test('gives up on a part straddling the ravine', () => {
    // どちらへずらしても片方の足がブロックを越えてストリップが変わるので、動かせない。
    const parts = place(spec({ id: 'C1', type: 'capacitor', holes: holes('e5', 'f5') }));

    const { parts: moved, errors } = relocateParts(parts, [end('e5', 'up')]);

    expect(pinsOf(moved[0]!)).toEqual(['e5', 'f5']);
    expect(errors).toHaveLength(1);
  });
});
