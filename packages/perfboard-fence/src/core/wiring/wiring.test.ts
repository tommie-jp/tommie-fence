import { describe, expect, test } from 'vitest';
import { netlistOf, resolveWires } from './wiring.ts';
import { createBoard } from '../model/board.ts';
import { LIMITS } from '../limits.ts';
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

describe('板の外の機器', () => {
  const devices = new Map([['BAT', new Set(['+', '-'])]]);
  const bat = {
    id: 'BAT', at: 'top' as const, label: 'BAT', pins: ['+', '-'], line: null,
  };

  test('joins a hole to a device pin without drawing a wire', () => {
    // **機器は板の上に無い。** 線を引くと、挿す場所があるように見えてしまう。
    const { wires, deviceLinks, errors } = resolveWires([wire('b3', 'BAT.+')], new Map(), board, devices);

    expect(errors).toEqual([]);
    expect(wires).toEqual([]);
    expect(deviceLinks).toHaveLength(1);
  });

  test('puts the part and the device pin on the same net', () => {
    const { wires, deviceLinks } = resolveWires([wire('b3', 'BAT.+')], new Map(), board, devices);
    const nets = netlistOf([part('R1', ['b3', 'b7'])], wires, [], [bat], deviceLinks);
    const joined = nets.find((net) => net.refs.includes('R1.1'));

    expect(joined?.refs).toContain('BAT.+');
  });

  test('names a device it has not been told about, with the whole endpoint', () => {
    // 番地として読めないと言うと、名前を間違えた人が番地の話を聞かされる。
    // 点の前だけを返すと、`1.5` のような綴りで「書いていない語」を指してしまう。
    const { errors } = resolveWires([wire('b3', 'PSU.+')], new Map(), board, devices);

    expect(errors[0]?.message).toContain('そんな機器はありません');
    expect(errors[0]?.message).toContain('PSU.+');
  });

  test('says a bad device name once, not once per end', () => {
    // 帯は 8 件で打ち切る。同じ行から同じ報告が 2 度出ると、本物が押し出される。
    const { errors } = resolveWires([wire('PSU.+', 'PSU.-')], new Map(), board, devices);

    expect(errors).toHaveLength(1);
  });

  test('refuses a wire whose two ends are the same device pin', () => {
    const { deviceLinks, errors } = resolveWires([wire('BAT.+', 'BAT.+')], new Map(), board, devices);

    expect(deviceLinks).toEqual([]);
    expect(errors[0]?.message).toContain('両端が同じ');
  });

  test('counts device links against the wire limit', () => {
    // 線を引かないだけで導通は増える。数えないと頭打ちを素通りする。
    const many = Array.from({ length: LIMITS.wires + 20 }, () => wire('BAT.+', 'BAT.-'));
    const { deviceLinks, errors } = resolveWires(many, new Map(), board, devices);

    expect(deviceLinks.length).toBe(LIMITS.wires);
    expect(errors.some((one) => one.message.includes('配線が多すぎます'))).toBe(true);
  });

  test('names a pin the device has not got, and lists the ones it has', () => {
    const { errors } = resolveWires([wire('b3', 'BAT.gnd')], new Map(), board, devices);

    expect(errors[0]?.message).toContain('という足はありません');
    expect(errors[0]?.message).toContain('+ / -');
  });

  test('still reports an unreadable hole at the other end', () => {
    const { deviceLinks, errors } = resolveWires([wire('z99', 'BAT.+')], new Map(), board, devices);

    expect(deviceLinks).toEqual([]);
    expect(errors).toHaveLength(1);
  });

  test('joins two device pins to each other', () => {
    const { deviceLinks, errors } = resolveWires([wire('BAT.+', 'BAT.-')], new Map(), board, devices);

    expect(errors).toEqual([]);
    expect(deviceLinks).toHaveLength(1);
  });
});

describe('機器へつなぐ配線の色', () => {
  const devices = new Map([['BAT', new Set(['+', '-'])]]);

  test('says a colour written there will not show, instead of dropping it', () => {
    const spec = { from: 'b3', to: 'BAT.+', color: 'red', line: 4 };
    const { deviceLinks, errors } = resolveWires([spec], new Map(), board, devices);

    expect(deviceLinks).toHaveLength(1);
    expect(errors[0]?.notice).toBe(true);
    expect(errors[0]?.message).toContain('色');
  });

  test('keeps quiet about the colour when the wire did not connect anyway', () => {
    // 直す先は色ではなく読めなかった端。**同じ行に 2 件出すと本物が埋もれる。**
    const spec = { from: 'z99', to: 'BAT.+', color: 'red', line: 4 };
    const { errors } = resolveWires([spec], new Map(), board, devices);

    expect(errors).toHaveLength(1);
    expect(errors[0]?.notice).not.toBe(true);
  });
});
