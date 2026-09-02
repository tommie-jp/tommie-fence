import { describe, expect, test } from 'vitest';
import { checkErc } from './erc.ts';
import { createBoard, holeStrip } from '../model/board.ts';
import { parseAddress } from '../model/address.ts';
import { netlistOf, resolveWires } from '../wiring/wiring.ts';
import type { PlacedPart, RoutedWire } from '../types.ts';

const board = createBoard({ cols: 10, rows: 6 });
const at = (hole: string) => parseAddress(hole)!;

const part = (id: string, holes: readonly string[], line = 1): PlacedPart => ({
  id,
  type: 'resistor',
  variant: null,
  value: null,
  line,
  pins: holes.map((hole) => ({ address: at(hole), strip: holeStrip(at(hole)) })),
});

const wireSpecs = (pairs: readonly (readonly [string, string])[]) =>
  pairs.map(([from, to], index) => ({ from, to, color: null, line: index + 10 }));

const run = (
  parts: readonly PlacedPart[],
  pairs: readonly (readonly [string, string])[] = [],
  named: readonly (readonly [string, string])[] = [],
) => {
  const { wires } = resolveWires(wireSpecs(pairs), new Map(), board);
  const namedPairs = named.map(([hole, name]) => [at(hole), name] as const);
  const netlist = netlistOf(parts, wires, namedPairs);
  return checkErc({
    parts,
    wires: wires as readonly RoutedWire[],
    netlist,
    namedStrips: new Set(namedPairs.map(([address]) => holeStrip(address))),
    devices: [],
  });
};

describe('未結線のピン', () => {
  test('names a pin no wire reaches', () => {
    // **全穴が独立しているので、挿しただけでは何にもつながらない。**
    // ブレッドボードは列が導通しているので、この見落としが起きにくい。
    const found = run([part('R1', ['b3', 'b7'])]);

    expect(found.map((e) => e.message).join(' ')).toContain('R1.1');
    expect(found.map((e) => e.message).join(' ')).toContain('R1.2');
  });

  test('points at the line the part was written on', () => {
    const found = run([part('R1', ['b3', 'b7'], 5)]);

    expect(found.length).toBeGreaterThan(0);
    expect(found.every((error) => error.line === 5)).toBe(true);
  });

  test('says nothing about a pin a wire reaches', () => {
    const found = run([part('R1', ['b3', 'b7']), part('R2', ['c3', 'c7'])], [['b3', 'c3'], ['b7', 'c7']]);

    expect(found).toEqual([]);
  });

  test('takes a named hole as an intended way off the board', () => {
    // `points:` で名前を付けた穴は、電源や信号の出入口という意思表示。
    // そこを「つなぎ忘れ」と言うと、正しい図が毎回叱られる。
    const found = run([part('R1', ['b3', 'b7'])], [['b7', 'a1']], [['b3', 'VCC'], ['a1', 'GND']]);

    expect(found).toEqual([]);
  });
});

describe('部品の中でつながった足 (端面実装の凹の両端)', () => {
  const edge: PlacedPart = {
    id: 'J1', type: 'sma', variant: 'female-edge', value: null, line: 3,
    pins: ['c1', 'b0', 'd0'].map((hole) => ({ address: at(hole), strip: holeStrip(at(hole)) })),
  };

  test('is satisfied by a wire to either tip — the other rides along', () => {
    const found = run([edge, part('R1', ['c3', 'c7'])], [['c1', 'c3'], ['d0', 'c7']]);

    expect(found).toEqual([]);
  });

  test('still calls the tips loose when no wire reaches either of them', () => {
    // 凹の両端どうしはつながっているが、それは相手ではない。
    const found = run([edge, part('R1', ['c3', 'c7'])], [['c1', 'c3']]);
    const text = found.map((e) => e.message).join(' ');

    expect(text).toContain('J1.2');
    expect(text).toContain('J1.3');
    expect(found.every((e) => e.line === 3 || e.line === 1)).toBe(true);
  });
});

describe('短絡した部品', () => {
  test('names a part whose two pins landed on one net', () => {
    // **boardwright の「同じ穴が 2 ネットに属していないか」は、この盤面では
    // 構造的に起きない** (穴 1 つが 1 ネット)。実際に起きる短絡はこちら。
    const found = run(
      [part('R1', ['b3', 'b7'], 4), part('R2', ['c3', 'c7'])],
      [['b3', 'b7'], ['b3', 'c3'], ['b7', 'c7']],
    );

    expect(found.some((e) => e.message.includes('R1') && e.message.includes('短絡') && e.line === 4)).toBe(true);
  });

  test('says nothing when the pins are on different nets', () => {
    const found = run(
      [part('R1', ['b3', 'b7']), part('R2', ['c3', 'c7'])],
      [['b3', 'c3'], ['b7', 'c7']],
    );

    expect(found.filter((e) => e.message.includes('短絡'))).toEqual([]);
  });
});

describe('空中配線', () => {
  test('names a wire that reaches no pin at all', () => {
    const found = run([part('R1', ['b3', 'b7'])], [['b3', 'b7'], ['d1', 'd4']]);

    expect(found.some((e) => e.message.includes('つないでいません') && e.line === 11)).toBe(true);
  });

  test('says nothing about a wire that reaches a pin', () => {
    const found = run([part('R1', ['b3', 'b7']), part('R2', ['c3', 'c7'])], [['b3', 'c3'], ['b7', 'c7']]);

    expect(found.filter((e) => e.message.includes('つないでいません'))).toEqual([]);
  });
});

describe('the findings themselves', () => {
  test('are notices: the fence was read and the drawing is faithful', () => {
    // 直さないと図が出ないものではなく、**図のとおりに組むと動かない**もの。
    expect(run([part('R1', ['b3', 'b7'])]).every((e) => e.notice === true)).toBe(true);
  });

  test('say nothing about an empty board', () => {
    expect(run([])).toEqual([]);
  });
});
