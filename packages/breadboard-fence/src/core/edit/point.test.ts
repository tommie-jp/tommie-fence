import { describe, expect, test } from 'vitest';
import { parseAddress } from '../model/address.ts';
import type { Address } from '../types.ts';
import { movableNodes, movePoint, nodeSpans } from './point.ts';
import { applyEdits } from './shared.ts';

const at = (text: string): Address => {
  const address = parseAddress(text);
  if (address === null) throw new Error(`番地ではありません: ${text}`);
  return address;
};

const LED = `board: half
points:
  vin: a5
parts:
  R1: resistor vin a10 330
  D1: led b12(A) b13(K) red
wires:
  - a10 -- b12
  - +t5 -- vin red
`;

const BARE = `board: half
parts:
  R1: resistor a5 a10 330
wires:
  - a10 -- b12
`;

const moved = (source: string, from: string, to: string): string => {
  const result = movePoint(source, at(from), at(to));
  if (!result.ok) throw new Error(result.error.message);
  return applyEdits(source, result.value.edits);
};

describe('movePoint', () => {
  test('moves a named hole by its one line, and the rest follows', () => {
    // **これが points: の存在理由。** 名前で書いた場所は綴りを変えずに付いてくる。
    const after = moved(LED, 'a5', 'c5');

    expect(after).toContain('  vin: c5');
    expect(after).toContain('R1: resistor vin a10 330');
    expect(after).toContain('- +t5 -- vin red');
  });

  test('carries a bare spelling of the same hole along with the name', () => {
    // 置いていくと接続が切れる。**丸ごと運ぶ**の約束を優先する。
    const mixed = LED.replace('- a10 -- b12', '- a5 -- b12');
    const after = moved(mixed, 'a5', 'c5');

    expect(after).toContain('  vin: c5');
    expect(after).toContain('- c5 -- b12');
  });

  test('moves every place a nameless hole is written', () => {
    const after = moved(BARE, 'a10', 'a12');

    expect(after).toContain('R1: resistor a5 a12 330');
    expect(after).toContain('- a12 -- b12');
  });

  test('keeps the tag when the hole it moves carries one', () => {
    const after = moved(LED, 'b12', 'c12');

    expect(after).toContain('D1: led c12(A) b13(K) red');
    expect(after).toContain('- a10 -- c12');
  });

  test('leaves the title, the value and the colour alone', () => {
    const after = moved(BARE, 'a10', 'a12');

    expect(after).toContain('resistor a5 a12 330');
    expect(after).toContain('board: half');
  });

  test('says nothing changed when the node is already there', () => {
    const result = movePoint(BARE, at('a10'), at('a10'));

    expect(result.ok && result.value.edits).toEqual([]);
  });

  test('refuses a move that would collapse a part onto one hole', () => {
    // 両端が同じ穴に来た部品は長さ 0 になり、図から消えて短絡になる。
    const result = movePoint(BARE, at('a10'), at('a5'));

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message).toContain('R1');
  });

  test('refuses to walk off the board', () => {
    expect(movePoint(BARE, at('a10'), at('a99')).ok).toBe(false);
  });

  test('says so when nothing is written at that hole', () => {
    const result = movePoint(BARE, at('j30'), at('j29'));

    expect(!result.ok && result.error.message).toContain('j30');
  });

  test('goes there and back again, leaving the fence as it was', () => {
    const there = moved(BARE, 'a10', 'c12');
    const back = movePoint(there, at('c12'), at('a10'));

    expect(back.ok && applyEdits(there, back.value.edits)).toBe(BARE);
  });

  test('tells when the move joined something', () => {
    // 同じ列へ寄せると、その列の導通に加わる。
    const result = movePoint(BARE, at('a5'), at('b12'));

    expect(result.ok && result.value.diff.gained.length).toBeGreaterThan(0);
  });
});

describe('movableNodes', () => {
  test('lists every hole something is written at, with its name', () => {
    const nodes = movableNodes(LED);
    const vin = nodes.find((node) => node.name === 'vin');

    expect(vin?.address).toEqual(at('a5'));
    expect(nodes.map((node) => node.uses).every((uses) => uses > 0)).toBe(true);
  });

  test('counts how many places write the hole', () => {
    const nodes = movableNodes(BARE);

    expect(nodes.find((node) => node.address.col === 10)?.uses).toBe(2);
  });

  test('orders them by row and column, not by spelling', () => {
    // `a10` が `a5` より先に来ると、一覧が読み順にならない。
    const nodes = movableNodes(BARE).filter((node) => node.address.kind === 'hole');

    expect(nodes.map((node) => node.address.col)).toEqual([...nodes.map((node) => node.address.col)].sort((a, b) => a - b));
  });

  test('is empty for a fence it cannot read', () => {
    expect(movableNodes('parts: [')).toEqual([]);
  });
});

describe('nodeSpans', () => {
  test('points at every place the hole is written', () => {
    const spans = nodeSpans(BARE, at('a10'));

    expect(spans).toHaveLength(2);
    expect(spans.map((span) => span.line).sort()).toEqual([3, 5]);
  });

  test('points at the name line too, since that is where it lives', () => {
    const spans = nodeSpans(LED, at('a5'));

    expect(spans.some((span) => span.line === 3)).toBe(true);
  });

  test('is empty for a hole nothing is written at', () => {
    expect(nodeSpans(BARE, at('j30'))).toEqual([]);
  });
});
