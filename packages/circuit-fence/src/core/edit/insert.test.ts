import { describe, expect, test } from 'vitest';
import { insertPart, insertWire, nextPartId } from './insert.ts';
import { applyRewrite } from './shared.ts';
import { compileCircuit } from '../index.ts';
import { parseAddress } from '../model/address.ts';

const at = (text: string) => ({ kind: 'cell' as const, address: parseAddress(text)! });
const cell = (text: string) => parseAddress(text)!;

const RC = [
  'title: RC',
  'parts:',
  '  R1: resistor a1 a3 10k',
  '  Q1: npn b5',
  'wires:',
  '  - a3 -- b1',
  '',
].join('\n');

const added = (source: string, result: ReturnType<typeof insertWire>) => {
  if (!result.ok) throw new Error(result.error.message);
  return { ...result.value, source: applyRewrite(source, result.value) };
};

describe('insertWire', () => {
  test('adds a line after the wires already written, in the same shape', () => {
    const { source } = added(RC, insertWire(RC, at('a1'), at('c1')));

    expect(source).toBe([
      'title: RC', 'parts:', '  R1: resistor a1 a3 10k', '  Q1: npn b5',
      'wires:', '  - a3 -- b1', '  - a1 -- c1', '',
    ].join('\n'));
  });

  test('writes the operator it was given', () => {
    expect(added(RC, insertWire(RC, at('a1'), at('c5'), '-|')).source).toContain('  - a1 -| c5');
  });

  test('can hang a wire on a pin of a part', () => {
    const wire = insertWire(RC, at('a1'), { kind: 'pin', part: 'Q1', pin: 'b' });

    expect(added(RC, wire).source).toContain('  - a1 -- Q1.b');
  });

  test('makes the key when the fence has no wires yet', () => {
    const source = ['parts:', '  R1: resistor a1 a3', ''].join('\n');

    expect(added(source, insertWire(source, at('a3'), at('c3'))).source).toBe(
      ['parts:', '  R1: resistor a1 a3', 'wires:', '  - a3 -- c3', ''].join('\n'),
    );
  });

  test('says which connections the new wire made', () => {
    expect(added(RC, insertWire(RC, at('a1'), at('c1'))).diff.gained.length).toBeGreaterThan(0);
  });

  test('refuses an address off the grid', () => {
    expect(insertWire(RC, at('a1'), { kind: 'cell', address: { row: 0, col: 200 } }).ok).toBe(false);
  });

  test('refuses a wire whose two ends are the same crossing', () => {
    // 長さ 0 の線は図に出ず、押し間違いでしか生まれない。
    const result = insertWire(RC, at('a1'), at('a1'));

    expect(result.ok === false && result.error.message).toContain('同じ');
  });

  test('refuses a pin on a part that is not there', () => {
    const result = insertWire(RC, at('a1'), { kind: 'pin', part: 'Q9', pin: 'b' });

    expect(result.ok === false && result.error.message).toContain('Q9');
  });

  test('refuses a pin the part does not have', () => {
    const result = insertWire(RC, at('a1'), { kind: 'pin', part: 'Q1', pin: 'zz' });

    expect(result.ok).toBe(false);
  });

  test('refuses wires written in flow style, which have no line of their own', () => {
    const source = ['parts:', '  R1: resistor a1 a3', 'wires: [a1 -- a3]', ''].join('\n');

    expect(insertWire(source, at('a1'), at('c1')).ok === false).toBe(true);
  });

  test('refuses a fence it cannot read', () => {
    expect(insertWire('parts:\n  R1: [unclosed\n', at('a1'), at('a3')).ok).toBe(false);
  });
});

describe('insertPart', () => {
  const part = (source: string, spec: Parameters<typeof insertPart>[1]) => added(source, insertPart(source, spec));

  test('adds a line after the parts already written', () => {
    const { source } = part(RC, { id: 'C1', type: 'capacitor', at: [cell('c1'), cell('c3')] });

    expect(source).toBe([
      'title: RC', 'parts:', '  R1: resistor a1 a3 10k', '  Q1: npn b5', '  C1: capacitor c1 c3',
      'wires:', '  - a3 -- b1', '',
    ].join('\n'));
  });

  test('writes the value when it is given', () => {
    expect(part(RC, { id: 'C1', type: 'capacitor', at: [cell('c1'), cell('c3')], value: '100n' }).source)
      .toContain('  C1: capacitor c1 c3 100n');
  });

  test('makes the key before the wires when the fence has no parts yet', () => {
    const source = ['wires:', '  - a1 -- a3', ''].join('\n');

    expect(part(source, { id: 'G1', type: 'ground', at: [cell('a3')] }).source).toBe(
      ['parts:', '  G1: ground a3', 'wires:', '  - a1 -- a3', ''].join('\n'),
    );
  });

  test('refuses an id that is already taken', () => {
    const result = insertPart(RC, { id: 'R1', type: 'capacitor', at: [cell('c1'), cell('c3')] });

    expect(result.ok === false && result.error.message).toContain('R1');
  });

  test('refuses an id the grammar does not allow', () => {
    expect(insertPart(RC, { id: 'a b', type: 'ground', at: [cell('c1')] }).ok).toBe(false);
  });

  test('refuses a type it does not know', () => {
    expect(insertPart(RC, { id: 'Z1', type: 'flux-capacitor', at: [cell('c1')] }).ok).toBe(false);
  });

  test('refuses the wrong number of addresses for the type', () => {
    expect(insertPart(RC, { id: 'C1', type: 'capacitor', at: [cell('c1')] }).ok).toBe(false);
    expect(insertPart(RC, { id: 'G2', type: 'ground', at: [cell('c1'), cell('c3')] }).ok).toBe(false);
  });

  test('refuses an address off the grid', () => {
    expect(insertPart(RC, { id: 'G2', type: 'ground', at: [{ row: 99, col: 1 }] }).ok).toBe(false);
  });

  test('refuses parts written in flow style', () => {
    const source = ['parts: {R1: resistor a1 a3}', ''].join('\n');

    expect(insertPart(source, { id: 'C1', type: 'capacitor', at: [cell('c1'), cell('c3')] }).ok).toBe(false);
  });
});

describe('nextPartId', () => {
  test('names a new part from the prefix the docs use', () => {
    expect(nextPartId(RC, 'capacitor')).toBe('C1');
  });

  test('takes the smallest number the prefix has not used yet', () => {
    // RC には R1 が居るので、次の抵抗は R2。
    expect(nextPartId(RC, 'resistor')).toBe('R2');
  });

  test('counts by prefix, not by type, the way the docs examples do', () => {
    // P1 が lamp なら、ポテンショメータは P2 (同じ接頭辞を分け合う)。
    const source = ['parts:', '  P1: lamp a1 a3', ''].join('\n');

    expect(nextPartId(source, 'potentiometer')).toBe('P2');
  });

  test('fills a gap, since the number is only there to be unique', () => {
    const source = ['parts:', '  R2: resistor a1 a3', ''].join('\n');

    expect(nextPartId(source, 'resistor')).toBe('R1');
  });

  test('has no name to offer for the three that carry a net name', () => {
    // port / vcc / vee の ID は図に出る名前そのもの。訊くしかない。
    expect(nextPartId(RC, 'port')).toBeNull();
    expect(nextPartId(RC, 'vcc')).toBeNull();
  });

  test('has nothing to offer for a type it does not know', () => {
    expect(nextPartId(RC, 'flux-capacitor')).toBeNull();
  });

  test('has nothing to offer for a fence it cannot read', () => {
    expect(nextPartId('parts:\n  R1: [unclosed\n', 'resistor')).toBeNull();
  });
});

describe('レビューで出た穴', () => {
  test('adds a wire to a sequence written at column 0, which is valid YAML', () => {
    // 字下げ 0 桁を「無い」と読んで 2 つ空けると、足した行が前の値に畳み込まれ、
    // フェンスが読めなくなる (図がまるごと消える)。
    const source = 'parts:\n  R1: resistor a1 a3 10k\nwires:\n- a1 -- a3\n';
    const result = insertWire(source, at('a1'), at('d1'));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const written = applyRewrite(source, result.value);

    expect(written).toContain('\n- a1 -- d1');
    expect(compileCircuit(written).errors).toEqual([]);
  });

  test('refuses a value that YAML would eat, the way setField does', () => {
    const source = 'parts:\n  R1: resistor a1 a3 10k\n';

    // `#hi` はコメントとして飲まれ、`10 k` は行を壊し、`l=x` は札になる。
    for (const value of ['#hi', '10 k', 'l=x']) {
      expect(insertPart(source, { id: 'R2', type: 'resistor', at: [cell('c1'), cell('c3')], value }).ok).toBe(false);
    }
  });

  test('still takes an ordinary value', () => {
    const source = 'parts:\n  R1: resistor a1 a3 10k\n';
    const result = insertPart(source, { id: 'R2', type: 'resistor', at: [cell('c1'), cell('c3')], value: '4k7' });

    expect(result.ok).toBe(true);
  });
});

describe('同じ名前をもう一度置く', () => {
  const RAIL = 'parts:\n  VCC: vcc a1\n  R1: resistor a1 a3\n';

  test('takes a second rail of the same name — that is how a schematic is drawn', () => {
    const result = insertPart(RAIL, { id: 'VCC', type: 'vcc', at: [cell('e1')] });

    expect(result.ok).toBe(true);
  });

  test('still refuses a name that a wire points at', () => {
    const result = insertPart(RAIL, { id: 'R1', type: 'resistor', at: [cell('e1'), cell('e3')] });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.message).toContain('もう使われています');
  });
});

