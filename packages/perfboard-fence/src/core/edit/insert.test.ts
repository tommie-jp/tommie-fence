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

const WITH_WIRES = `board: 12x7
parts:
  R1: resistor b2 b6 10k
wires:
  - a2 -- b2
`;

describe('insertWire', () => {
  test('adds one line under the wires it already has', () => {
    expect(added(WITH_WIRES, 'b6', 'b8')).toBe(`board: 12x7
parts:
  R1: resistor b2 b6 10k
wires:
  - a2 -- b2
  - b6 -- b8
`);
  });

  test('copies the indent from the line above, not a guess', () => {
    // **0 桁は「字下げが無い」ではない。** 揃えないとフェンスが読めなくなる。
    const flat = 'board: 12x7\nwires:\n- a1 -- a5\n';

    expect(added(flat, 'a5', 'a7')).toContain('\n- a5 -- a7');
  });

  test('adds the key too when there are no wires yet', () => {
    const none = 'board: 12x7\nparts:\n  R1: resistor b2 b6 10k\n';
    const text = added(none, 'b6', 'c6');

    expect(text).toContain('wires:\n  - b6 -- c6');
  });

  test('puts the new key before the trailing blank line', () => {
    const none = 'board: 12x7\nparts:\n  R1: resistor b2 b6 10k\n\n';

    expect(added(none, 'b6', 'c6').endsWith('  - b6 -- c6\n\n')).toBe(true);
  });

  test('refuses a wire with no length, which never shows in the drawing', () => {
    const result = insertWire(WITH_WIRES, at('b2'), at('b2'));

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message).toContain('同じ穴');
  });

  test('refuses an end that is off the board', () => {
    expect(insertWire(WITH_WIRES, at('b2'), at('b99')).ok).toBe(false);
  });

  test('refuses wires written in flow form', () => {
    const flow = 'board: 12x7\nwires: [a1 -- a5]\n';

    expect(insertWire(flow, at('a5'), at('b5')).ok).toBe(false);
  });

  test('tells what the new wire joined', () => {
    const result = insertWire(WITH_WIRES, at('b6'), at('b8'));

    expect(result.ok && result.value.diff).toBeDefined();
  });
});
