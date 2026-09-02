import { describe, expect, test } from 'vitest';
import { parseAddress } from '../model/address.ts';
import type { Address } from '../types.ts';
import { movePart, movablePartIds, partSpans } from './move.ts';
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
  R1: resistor a5 a10 330
  D1: led b12(A) b13(K) red
  U1: dip8 @ e5 NJM4556A
wires:
  - a10 -- b12
`;

const moved = (source: string, id: string, to: string): string => {
  const result = movePart(source, id, at(to));
  if (!result.ok) throw new Error(result.error.message);
  return applyEdits(source, result.value.edits);
};

describe('movePart', () => {
  test('carries every hole of a part by the same step', () => {
    // **最初の穴がアンカー。** 形を保ったまま平行移動する。
    expect(moved(LED, 'R1', 'c5')).toContain('R1: resistor c5 c10 330');
  });

  test('moves along the columns too', () => {
    expect(moved(LED, 'R1', 'a7')).toContain('R1: resistor a7 a12 330');
  });

  test('keeps the tag on a hole that carries one', () => {
    // `(A)` は極性の印。番地だけを差し替える。
    expect(moved(LED, 'D1', 'c12')).toContain('D1: led c12(A) c13(K) red');
  });

  test('moves a part placed by one hole', () => {
    expect(moved(LED, 'U1', 'f5')).toContain('U1: dip8 @ f5 NJM4556A');
  });

  test('leaves the value, the name and everything else alone', () => {
    const after = moved(LED, 'R1', 'c5');

    expect(after).toContain('points:\n  vin: a5');
    expect(after).toContain('- a10 -- b12');
  });

  test('says nothing changed when it is already there', () => {
    const result = movePart(LED, 'R1', at('a5'));

    expect(result.ok && result.value.edits).toEqual([]);
  });

  test('refuses to walk off the rows, naming the line', () => {
    // 縦に寝た部品を下げると、後ろの足が j より下へ出る。
    const across = 'board: half\nparts:\n  R2: resistor a1 e1 1k\n';
    const result = movePart(across, 'R2', at('g1'));

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.line).toBe(3);
    expect(!result.ok && result.error.message).toContain('板の外');
  });

  test('refuses to walk off the columns', () => {
    // half は 30 列。a5 を a27 へ動かすと、もう一方の足が 32 列目になる。
    expect(movePart(LED, 'R1', at('a27')).ok).toBe(false);
  });

  test('refuses a part it cannot find', () => {
    const result = movePart(LED, 'X9', at('a1'));

    expect(!result.ok && result.error.message).toContain('X9');
  });

  test('moves a hole written by its name, since the name is where it is', () => {
    // `vin: a5` の名前で書いても、動かすのは番地のほう。
    const named = LED.replace('resistor a5 a10', 'resistor vin a10');
    const after = moved(named, 'R1', 'c5');

    expect(after).toContain('R1: resistor c5 c10 330');
  });

  test('says nothing changed while the part stays on the same strips', () => {
    // **同じ列の 5 穴はつながっている。** a10 から c10 へ寄っても導通は同じ。
    // 動いたのに何も言わないのは正しい (言うと嘘になる)。
    const result = movePart(LED, 'R1', at('c5'));

    expect(result.ok && result.value.diff).toEqual({ lost: [], gained: [] });
  });

  test('tells which connections came apart when the part leaves the strip', () => {
    // 溝をまたぐと別の導通になる。a10 へ来ていた配線から離れる。
    const result = movePart(LED, 'R1', at('f5'));

    expect(result.ok && result.value.diff.lost.length).toBeGreaterThan(0);
  });

  test('goes there and back again, leaving the fence as it was', () => {
    const there = moved(LED, 'R1', 'c7');
    const back = movePart(there, 'R1', at('a5'));

    expect(back.ok && applyEdits(there, back.value.edits)).toBe(LED);
  });
});

describe('movablePartIds', () => {
  test('lists the parts that can be grabbed', () => {
    expect(movablePartIds(LED)).toEqual(['R1', 'D1', 'U1']);
  });

  test('is empty for a fence it cannot read', () => {
    expect(movablePartIds('parts: [')).toEqual([]);
  });
});

describe('partSpans', () => {
  test('points at every hole of the part, for the editor to light up', () => {
    const spans = partSpans(LED, 'R1');

    expect(spans).toHaveLength(2);
    expect(spans[0]).toMatchObject({ line: 5, length: 2 });
  });

  test('is empty for a part that is not there', () => {
    expect(partSpans(LED, 'X9')).toEqual([]);
  });
});
