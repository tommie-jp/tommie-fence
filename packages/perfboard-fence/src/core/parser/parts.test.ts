import { describe, expect, test } from 'vitest';
import { parsePartLine } from './parts.ts';

describe('parsePartLine', () => {
  test('reads type, two holes and a value', () => {
    expect(parsePartLine('R1', 'resistor b3 b7 10k')).toEqual({
      ok: true,
      value: {
        id: 'R1',
        type: 'resistor',
        variant: null,
        written: 'resistor',
        holes: ['b3', 'b7'],
        value: '10k',
      },
    });
  });

  test('takes a part without a value', () => {
    const result = parsePartLine('D1', 'led c5 c9');

    expect(result.ok && result.value.value).toBeNull();
    expect(result.ok && result.value.holes).toEqual(['c5', 'c9']);
  });

  test('keeps the rest of the line as one value, so a label can have spaces', () => {
    const result = parsePartLine('C1', 'capacitor a1 a4 100n 50V');

    expect(result.ok && result.value.value).toBe('100n 50V');
  });

  test('keeps the spelling as written, so the report can point at it', () => {
    // 略記を畳んだ綴りは行のどこにも無いので、それで探すと印が消える。
    const result = parsePartLine('R1', 'r b3 b7 10k');

    expect(result.ok && result.value.type).toBe('resistor');
    expect(result.ok && result.value.written).toBe('r');
  });

  test('says a two-lead part needs two holes', () => {
    expect(parsePartLine('R1', 'resistor b3').ok).toBe(false);
    expect(parsePartLine('R1', 'resistor').ok).toBe(false);
  });

  test('names a type it cannot place, rather than drawing nothing', () => {
    // 名前は知っているが置けないもの。**綴りを疑わせない。**
    const result = parsePartLine('SW1', 'button b3 b5');

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message).toContain('button');
    expect(!result.ok && result.error.message).toContain('まだ置けません');
  });

  test('places a three-lead part written with three holes', () => {
    const result = parsePartLine('Q1', 'transistor b3 b4 b5 2SC1815');

    expect(result.ok && result.value.holes).toEqual(['b3', 'b4', 'b5']);
    expect(result.ok && result.value.value).toBe('2SC1815');
  });

  test('places a dip from one anchor, because the package fixes the rest', () => {
    const result = parsePartLine('U1', 'dip8 b3 NE555');

    expect(result.ok && result.value.holes).toEqual(['b3']);
    expect(result.ok && result.value.value).toBe('NE555');
  });

  test('says how many holes a part wants when too few are written', () => {
    const result = parsePartLine('Q1', 'transistor b3 b4');

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message).toContain('3 つ');
  });

  test('takes a part number that reads like an address, on a one-anchor part', () => {
    // **型番は番地とそっくり** (`NE555` は ne 行 555 列としても読める)。
    // 穴を 1 つしか書かない形では足を増やしようが無いので、番地として弾かない。
    expect(parsePartLine('U1', 'dip8 b3 NE555').ok).toBe(true);
    expect(parsePartLine('U1', 'sip3 b3 LM358').ok).toBe(true);
  });

  test('still refuses an extra hole on a part whose legs are written out', () => {
    expect(parsePartLine('Q1', 'transistor b3 b4 b5 b6').ok).toBe(false);
  });

  test('names a type it does not know at all', () => {
    const result = parsePartLine('R1', 'resistr b3 b7');

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message).toContain('resistr');
    expect(!result.ok && result.error.token).toBe('resistr');
  });

  test('refuses an id that a wire could not refer to', () => {
    expect(parsePartLine('R 1', 'resistor b3 b7').ok).toBe(false);
  });

  test('refuses a hole that is not an address', () => {
    const result = parsePartLine('R1', 'resistor 3b b7');

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.token).toBe('3b');
  });
  test('refuses a third hole instead of swallowing it as the value', () => {
    // `resistor b3 b7 b9` を黙って「値 b9」にすると、書いた人は 3 本目の足が
    // 置かれたつもりのまま、図には出ない。
    const result = parsePartLine('X1', 'resistor b3 b7 b9');

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message).toContain('b9');
  });

  test('still takes a value that merely looks like a word', () => {
    expect(parsePartLine('R1', 'resistor b3 b7 10k').ok).toBe(true);
    expect(parsePartLine('D1', 'led c5 c9 red').ok).toBe(true);
  });
});

describe('端面実装の sma は 3 本足', () => {
  test('takes the centre conductor and the two tips of the notch', () => {
    const result = parsePartLine('J1', 'sma/female-edge c1 b0 d0');

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.holes).toEqual(['c1', 'b0', 'd0']);
  });

  test('asks for three holes, showing where the tips go, when only two are written', () => {
    // 2 本足のまま中心線に足を書かせると、アースの穴が中心導体の真下に埋まる。
    const result = parsePartLine('J1', 'sma/female-edge c1 c0');

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.message).toContain('穴を 3 つ');
    expect(result.ok === false && result.error.message).toContain('c1 b0 d0');
  });

  test('leaves the upright sma at two holes', () => {
    expect(parsePartLine('J1', 'sma/female c3 c5').ok).toBe(true);
  });
});

