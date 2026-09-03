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
    // 板の外に並べる機器は穴を持たないので、置く先が無い。
    expect(nextPartId(WITH_WIRES, 'device')).toBeNull();
    expect(nextPartId(WITH_WIRES, 'resistr')).toBeNull();
  });

  test('numbers a package the way its schematic symbol would be numbered', () => {
    expect(nextPartId(WITH_WIRES, 'dip8')).toBe('U1');
    expect(nextPartId(WITH_WIRES, 'pico-w')).toBe('U1');
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

describe('insertPart: 1 穴で置く (マップの 1 クリック)', () => {
  const placedAt = (type: string, hole: string, over: Partial<{ turn: number; flip: boolean }> = {}): string => {
    const id = nextPartId(WITH_WIRES, type) ?? 'X1';
    const result = insertPart(WITH_WIRES, { id, type, at: [at(hole)], ...over });
    if (!result.ok) throw new Error(result.error.message);
    return applyLineEdits(WITH_WIRES, result.value.lines);
  };
  const refused = (type: string, hole: string): string => {
    const result = insertPart(WITH_WIRES, { id: 'X9', type, at: [at(hole)] });
    if (result.ok) throw new Error('置けてしまいました');
    return result.error.message;
  };

  test('spreads a three-lead part to the right of the hole that was pressed', () => {
    expect(placedAt('transistor', 'c5')).toContain('Q1: transistor c5 c6 c7');
  });

  test('gives a two-lead part its default span, taken from how the examples write it', () => {
    expect(placedAt('resistor', 'c5')).toContain('R2: resistor c5 c10');
    expect(placedAt('led', 'c5')).toContain('D1: led c5 c6');
    expect(placedAt('capacitor', 'c5')).toContain('C1: capacitor c5 c8');
  });

  test('keeps a one-hole part as it is', () => {
    expect(placedAt('button', 'e5')).toContain('SW1: button @ e5');
  });

  test('refuses a rail, where every lead would share one net', () => {
    expect(refused('transistor', '+t5')).toContain('レール');
    expect(refused('resistor', '-b5')).toContain('レール');
  });

  test('refuses two leads in one rail, which wouldshort it out', () => {
    const result = insertPart(WITH_WIRES, { id: 'R2', type: 'resistor', at: [at('+t5'), at('+t10')] });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message).toContain('短絡');
  });

  test('allows a part across the two rails, which is how a decoupling cap is written', () => {
    expect(insertPart(WITH_WIRES, { id: 'C1', type: 'capacitor', at: [at('+t5'), at('-t5')] }).ok).toBe(true);
  });

  test('refuses the right edge by saying how many holes are needed, rather than folding back', () => {
    const message = refused('transistor', 'c29');

    expect(message).toContain('c29');
    expect(message).toContain('c31');
    expect(message).toContain('2 穴');
  });

  test('turns and flips before writing, so the line matches the ghost', () => {
    expect(placedAt('transistor', 'c5', { turn: 1 })).toContain('Q1: transistor c5 d5 e5');
    expect(placedAt('transistor', 'c5', { flip: true })).toContain('Q1: transistor c7 c6 c5');
    expect(placedAt('resistor', 'c10', { turn: 2 })).toContain('R2: resistor c10 c5');
  });

  test('writes the same line for a trial, but does not count what it would connect', () => {
    // ゴーストは穴しか見ずに捨てるので、**接続を数えるために図を 2 枚組み直さない**
    // (置く・動かすの 5.3ms のほぼ全部がそれ)。書く行は本番と 1 字も変わらない。
    const real = insertPart(WITH_WIRES, { id: 'Q1', type: 'transistor', at: [at('c5')] });
    const trial = insertPart(WITH_WIRES, { id: 'Q1', type: 'transistor', at: [at('c5')], preview: true });

    expect(trial.ok && trial.value.lines).toEqual(real.ok && real.value.lines);
    expect(trial.ok && trial.value.diff).toEqual({ lost: [], gained: [] });
    // 本番は「R1 とつながる」と言う (同じ列の穴なので)。
    expect(real.ok && real.value.diff.gained).toEqual([['Q1.1', 'R1.1']]);
  });

  test('refuses a trial for the same reasons as the real thing', () => {
    const trial = insertPart(WITH_WIRES, { id: 'Q9', type: 'transistor', at: [at('c29')], preview: true });

    expect(trial.ok).toBe(false);
    expect(!trial.ok && trial.error.message).toContain('2 穴');
  });

  test('finds the line it wrote by reading the fence back, not by the spelling at the head', () => {
    // `points:` に同じ名前があると、行の頭が `Q1:` の行が 2 つになる。綴りで探すと
    // 先に書いてあるほうを掴み、置いた行が `Q1: c20` に化ける。
    const named = 'board: half\npoints:\n  Q1: c20\nparts:\n  R1: resistor a5 a10 330\n';
    const result = insertPart(named, { id: 'Q1', type: 'transistor', at: [at('b2')], turn: 1 });

    expect(result.ok && applyLineEdits(named, result.value.lines))
      .toContain('  R1: resistor a5 a10 330\n  Q1: transistor b2 c2 d2');
    expect(result.ok && applyLineEdits(named, result.value.lines)).toContain('  Q1: c20');
  });

  test('reports a turn that does not fit instead of writing a broken line', () => {
    const result = insertPart(WITH_WIRES, { id: 'Q1', type: 'transistor', at: [at('i5')], turn: 1 });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message).toContain('板の外');
  });
});

describe('partCells', () => {
  test('lists every hole a part occupies, including the pins a package decides', () => {
    expect(partCells(WITH_WIRES, 'R1')).toEqual(['a5', 'a10']);

    const dip = 'board: half\nparts:\n  U1: dip8 @ e5\n';
    expect(partCells(dip, 'U1')).toEqual(['e5', 'e6', 'e7', 'e8', 'f8', 'f7', 'f6', 'f5']);
  });

  test('is empty for a part that is not there', () => {
    expect(partCells(WITH_WIRES, 'R9')).toEqual([]);
  });
});
