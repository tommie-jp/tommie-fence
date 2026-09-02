import { describe, expect, test } from 'vitest';
import { applyLineEdits } from 'fence-kit';
import { parseAddress } from '../model/address.ts';
import type { Address } from '../types.ts';
import { insertWire } from './insert.ts';

const at = (text: string): Address => {
  const address = parseAddress(text);
  if (address === null) throw new Error(`番地ではありません: ${text}`);
  return address;
};

const added = (source: string, from: string, to: string): string => {
  const result = insertWire(source, at(from), at(to));
  if (!result.ok) throw new Error(result.error.message);
  return applyLineEdits(source, result.value.lines);
};

const WITH_WIRES = `board: half
parts:
  R1: resistor a5 a10 330
wires:
  - a10 -- b12
`;

describe('insertWire', () => {
  test('adds one line under the wires it already has', () => {
    expect(added(WITH_WIRES, 'b12', 'b20')).toBe(`board: half
parts:
  R1: resistor a5 a10 330
wires:
  - a10 -- b12
  - b12 -- b20
`);
  });

  test('copies the indent from the line above, not a guess', () => {
    // **0 桁は「字下げが無い」ではない。** 揃えないとフェンスが読めなくなる。
    const flat = 'board: half\nwires:\n- a5 -- a10\n';

    expect(added(flat, 'a10', 'a12')).toContain('\n- a10 -- a12');
  });

  test('adds the key too when there are no wires yet', () => {
    const none = 'board: half\nparts:\n  R1: resistor a5 a10 330\n';
    const text = added(none, 'a10', 'b12');

    expect(text).toContain('wires:\n  - a10 -- b12');
  });

  test('puts the new key before the trailing blank line', () => {
    const none = 'board: half\nparts:\n  R1: resistor a5 a10 330\n\n';

    expect(added(none, 'a10', 'b12').endsWith('  - a10 -- b12\n\n')).toBe(true);
  });

  test('refuses a wire with no length, which never shows in the drawing', () => {
    const result = insertWire(WITH_WIRES, at('a5'), at('a5'));

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message).toContain('同じ穴');
  });

  test('refuses an end that is off the board', () => {
    expect(insertWire(WITH_WIRES, at('a5'), at('a63')).ok).toBe(false);
  });

  test('refuses wires written in flow form', () => {
    const flow = 'board: half\nwires: [a5 -- a10]\n';

    expect(insertWire(flow, at('a10'), at('b12')).ok).toBe(false);
  });

  test('tells what the new wire joined', () => {
    const result = insertWire(WITH_WIRES, at('b12'), at('b20'));

    expect(result.ok && result.value.diff).toBeDefined();
  });
});
