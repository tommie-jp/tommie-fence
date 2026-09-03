import { describe, expect, test } from 'vitest';
import { applyLineEdits } from 'fence-kit';
import { parseAddress } from '../model/address.ts';
import type { Address } from '../types.ts';
import { insertPart, insertWire, nextPartId } from './insert.ts';

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

describe('nextPartId', () => {
  test('names a part by its prefix and the smallest free number', () => {
    expect(nextPartId(WITH_WIRES, 'resistor')).toBe('R2');
    expect(nextPartId(WITH_WIRES, 'led')).toBe('D1');
  });

  test('counts by prefix, not by type, so numbers never collide', () => {
    // `D1` が LED なら、次のダイオードは D2 (種類ごとに数えると重なる)。
    const led = 'board: half\nparts:\n  D1: led a5 a6 red\n';

    expect(nextPartId(led, 'diode')).toBe('D2');
  });

  test('reads an abbreviation as the type it stands for', () => {
    expect(nextPartId(WITH_WIRES, 'r')).toBe('R2');
  });

  test('has no name for a type it cannot place', () => {
    expect(nextPartId(WITH_WIRES, 'dip8')).toBeNull();
    expect(nextPartId(WITH_WIRES, 'resistr')).toBeNull();
  });
});

describe('insertPart', () => {
  const placed = (source: string, part: Parameters<typeof insertPart>[1]): string => {
    const result = insertPart(source, part);
    if (!result.ok) throw new Error(result.error.message);
    return applyLineEdits(source, result.value.lines);
  };

  test('writes a two lead part as two holes', () => {
    expect(placed(WITH_WIRES, { id: 'R2', type: 'resistor', at: [at('c5'), at('c10')] }))
      .toContain('  R2: resistor c5 c10');
  });

  test('writes a part the package anchors with @', () => {
    // タクトスイッチは足の位置をパッケージが決めるので、書くのはアンカー 1 つ。
    expect(placed(WITH_WIRES, { id: 'SW1', type: 'button', at: [at('e5')] }))
      .toContain('  SW1: button @ e5');
  });

  test('adds the key too when there are no parts yet', () => {
    const none = 'board: half\nwires:\n  - a5 -- a10\n';

    expect(placed(none, { id: 'R1', type: 'resistor', at: [at('c5'), at('c10')] }))
      .toContain('parts:\n  R1: resistor c5 c10');
  });

  test('refuses the wrong number of holes for the type', () => {
    const result = insertPart(WITH_WIRES, { id: 'Q1', type: 'transistor', at: [at('c5'), at('c6')] });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message).toContain('3 つ');
  });

  test('refuses a name that is already taken', () => {
    expect(insertPart(WITH_WIRES, { id: 'R1', type: 'resistor', at: [at('c5'), at('c10')] }).ok).toBe(false);
  });

  test('refuses two leads in one hole', () => {
    expect(insertPart(WITH_WIRES, { id: 'R2', type: 'resistor', at: [at('c5'), at('c5')] }).ok).toBe(false);
  });

  test('refuses a hole off the board', () => {
    expect(insertPart(WITH_WIRES, { id: 'R2', type: 'resistor', at: [at('c5'), at('c63')] }).ok).toBe(false);
  });
});
