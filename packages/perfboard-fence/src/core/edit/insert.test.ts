import { describe, expect, test } from 'vitest';
import { applyLineEdits } from 'fence-kit';
import { parseAddress } from '../model/address.ts';
import type { Address } from '../types.ts';
import { insertPart, insertWire, nextPartId, partCells } from './insert.ts';

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

describe('nextPartId', () => {
  test('names a part by its prefix and the smallest free number', () => {
    expect(nextPartId(WITH_WIRES, 'resistor')).toBe('R2');
    expect(nextPartId(WITH_WIRES, 'led')).toBe('D1');
  });

  test('counts by prefix, not by type, so numbers never collide', () => {
    // `D1` が LED なら、次のダイオードは D2 (種類ごとに数えると重なる)。
    const led = 'board: 12x7\nparts:\n  D1: led b2 b4 red\n';

    expect(nextPartId(led, 'diode')).toBe('D2');
  });

  test('reads an abbreviation as the type it stands for', () => {
    expect(nextPartId(WITH_WIRES, 'r')).toBe('R2');
  });

  test('has no name for a type it cannot place', () => {
    // 板の外に並べる機器は入れ子で書くので、1 行では置けない。
    expect(nextPartId(WITH_WIRES, 'device')).toBeNull();
    expect(nextPartId(WITH_WIRES, 'resistr')).toBeNull();
  });

  test('numbers a package the way its schematic symbol would be numbered', () => {
    expect(nextPartId(WITH_WIRES, 'dip8')).toBe('U1');
    expect(nextPartId(WITH_WIRES, 'sip4')).toBe('J1');
  });
});

describe('insertPart', () => {
  const placed = (source: string, part: Parameters<typeof insertPart>[1]): string => {
    const result = insertPart(source, part);
    if (!result.ok) throw new Error(result.error.message);
    return applyLineEdits(source, result.value.lines);
  };

  test('writes a two lead part as two holes', () => {
    expect(placed(WITH_WIRES, { id: 'R2', type: 'resistor', at: [at('c2'), at('c6')] }))
      .toContain('  R2: resistor c2 c6');
  });

  test('writes a three lead part as three holes', () => {
    expect(placed(WITH_WIRES, { id: 'Q1', type: 'transistor', at: [at('d2'), at('d3'), at('d4')] }))
      .toContain('  Q1: transistor d2 d3 d4');
  });

  test('adds the key too when there are no parts yet', () => {
    const none = 'board: 12x7\nwires:\n  - a1 -- a5\n';

    expect(placed(none, { id: 'R1', type: 'resistor', at: [at('c2'), at('c6')] }))
      .toContain('parts:\n  R1: resistor c2 c6');
  });

  test('refuses the wrong number of holes for the type', () => {
    const result = insertPart(WITH_WIRES, { id: 'Q1', type: 'transistor', at: [at('c2'), at('c3')] });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message).toContain('3 つ');
  });

  test('refuses a name that is already taken', () => {
    expect(insertPart(WITH_WIRES, { id: 'R1', type: 'resistor', at: [at('c2'), at('c6')] }).ok).toBe(false);
  });

  test('refuses two leads in one hole', () => {
    expect(insertPart(WITH_WIRES, { id: 'R2', type: 'resistor', at: [at('c2'), at('c2')] }).ok).toBe(false);
  });

  test('refuses a hole off the board', () => {
    expect(insertPart(WITH_WIRES, { id: 'R2', type: 'resistor', at: [at('c2'), at('c99')] }).ok).toBe(false);
  });
});

describe('insertPart: 1 穴で置く (マップの 1 クリック)', () => {
  const BOARD = 'board: 12x7\nparts:\n  R1: resistor a1 a6 330\n';
  const placedAt = (type: string, hole: string, over: Partial<{ turn: number; flip: boolean }> = {}): string => {
    const id = nextPartId(BOARD, type) ?? 'X1';
    const result = insertPart(BOARD, { id, type, at: [at(hole)], ...over });
    if (!result.ok) throw new Error(result.error.message);
    return applyLineEdits(BOARD, result.value.lines);
  };
  const refused = (type: string, hole: string): string => {
    const result = insertPart(BOARD, { id: 'X9', type, at: [at(hole)] });
    if (result.ok) throw new Error('置けてしまいました');
    return result.error.message;
  };

  test('spreads a three-lead part to the right of the hole that was pressed', () => {
    expect(placedAt('transistor', 'b2')).toContain('Q1: transistor b2 b3 b4');
  });

  test('gives a two-lead part its default span, the same table as the breadboard', () => {
    expect(placedAt('resistor', 'b2')).toContain('R2: resistor b2 b7');
    expect(placedAt('led', 'b2')).toContain('D1: led b2 b3');
    expect(placedAt('capacitor', 'b2')).toContain('C1: capacitor b2 b5');
  });

  test('refuses the right edge by saying how many holes are needed, rather than folding back', () => {
    const message = refused('transistor', 'b11');

    expect(message).toContain('b11');
    expect(message).toContain('b13');
    expect(message).toContain('2 穴');
  });

  test('turns and flips before writing, so the line matches the ghost', () => {
    expect(placedAt('transistor', 'b2', { turn: 1 })).toContain('Q1: transistor b2 c2 d2');
    expect(placedAt('transistor', 'b2', { flip: true })).toContain('Q1: transistor b4 b3 b2');
  });
});

describe('partCells', () => {
  test('lists every hole a part occupies, including the pins a package decides', () => {
    expect(partCells('board: 12x7\nparts:\n  R1: resistor a1 a6 330\n', 'R1')).toEqual(['a1', 'a6']);
    expect(partCells('board: 12x7\nparts:\n  U1: dip8 b2\n', 'U1')).toHaveLength(8);
  });

  test('is empty for a part that is not there', () => {
    expect(partCells('board: 12x7\nparts:\n  R1: resistor a1 a6 330\n', 'R9')).toEqual([]);
  });
});
