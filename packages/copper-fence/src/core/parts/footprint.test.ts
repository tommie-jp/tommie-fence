import { describe, expect, test } from 'vitest';
import { createBoard } from '../model/board.ts';
import { parsePartLine } from '../parser/parts.ts';
import type { PartSpec } from '../types.ts';
import { SMA, footprintOf, place } from './footprint.ts';
import { isPolar, resolveKind, smdKeys, typeNames } from './catalog.ts';

const BOARD = createBoard(40, 20);
const part = (text: string): PartSpec => {
  const read = parsePartLine('U1', text);
  if (!read.ok) throw new Error(read.error.message);
  return read.value;
};
const at = (text: string, axes = new Map<string, 'x' | 'y'>(), resolve = (written: string) => written) =>
  footprintOf(part(text), BOARD, axes, (written) => {
    const [x, y] = resolve(written).split(',').map(Number);
    return x === undefined || y === undefined || Number.isNaN(x) ? `読めない端: ${written}` : { x, y };
  });
const pins = (text: string, axes?: Map<string, 'x' | 'y'>) => {
  const found = at(text, axes);
  if (!found.ok) throw new Error(found.reason);
  return found.value.pins.map((pin) => [pin.name, pin.points.map((point) => [Math.round(point.x * 100) / 100, Math.round(point.y * 100) / 100])]);
};

describe('place', () => {
  test('turns clockwise on screen, mirroring first', () => {
    expect(place({ x: 0, y: 0 }, 90, false, 1, 0)).toEqual({ x: 0, y: 1 });
    expect(place({ x: 0, y: 0 }, 0, true, 1, 0)).toEqual({ x: -1, y: 0 });
    expect(place({ x: 5, y: 5 }, 180, false, 1, 2)).toEqual({ x: 4, y: 3 });
  });
});

describe('sma', () => {
  test('solders its centre pin 1mm onto the board, and its shell to the ground', () => {
    expect(pins('sma left 10')).toEqual([['1', [[1, 10]]], ['2', [[2, 7.8], [2, 12.2]]]]);
    expect(pins('sma right 10')[0]).toEqual(['1', [[39, 10]]]);
    expect(pins('sma top 20')[0]).toEqual(['1', [[20, 1]]]);
    expect(pins('sma bottom 20')[0]).toEqual(['1', [[20, 19]]]);
  });

  test('reaches outside the board by its base and barrel', () => {
    const found = at('sma left 10');
    expect(found.ok && found.value.outline.x).toBeCloseTo(-(SMA.base + SMA.barrel));
  });

  test('refuses a place where its flange would hang over a corner', () => {
    const found = at('sma left 2');
    expect(!found.ok && found.reason).toMatch(/板の角にかかります/);
  });
});

describe('chips', () => {
  test('put their ends along the line they lie on', () => {
    expect(pins('capacitor/1608 20,10')).toEqual([['1', [[19.36, 10]]], ['2', [[20.64, 10]]]]);
    expect(pins('capacitor/1608 20,10', new Map([['U1', 'y']]))).toEqual([['1', [[20, 9.36]]], ['2', [[20, 10.64]]]]);
  });

  test('follow a written turn, and a mirror swaps the ends', () => {
    expect(pins('led/2012 20,10 r90')).toEqual([['1', [[20, 9.2]]], ['2', [[20, 10.8]]]]);
    expect(pins('led/2012 20,10 mirror')).toEqual([['1', [[20.8, 10]]], ['2', [[19.2, 10]]]]);
  });

  test('take the length of a diode from its leads', () => {
    expect(pins('diode/sod123 20,10')).toEqual([['1', [[18.52, 10]]], ['2', [[21.48, 10]]]]);
  });
});

describe('sot', () => {
  test('puts pins 1 and 2 above and 3 below, the way fence-kit draws it', () => {
    // 足先は胴 (幅 1.3) から (2.4 - 1.3) / 2 = 0.55 出る。点はその真ん中 (中心から 0.925)。
    expect(pins('transistor/sot23 20,10')).toEqual([['1', [[19.05, 9.07]]], ['2', [[20.95, 9.07]]], ['3', [[20, 10.93]]]]);
  });

  test('ties the tab of a SOT-89 to its middle pin', () => {
    expect(pins('ic3/sot89 20,10')).toEqual([
      // 足は胴 (幅 2.5) から 4.1 - 2.5 - 0.6 = 1.0 出る。タブは反対側に 0.6。
      ['1', [[18.5, 8.25]]], ['2', [[20, 8.25], [20, 11.55]]], ['3', [[21.5, 8.25]]],
    ]);
  });
});

describe('box', () => {
  test('numbers its pins down the left side and up the right', () => {
    expect(pins('box 20,10 4x6 6')).toEqual([
      ['1', [[17.75, 8]]], ['2', [[17.75, 10]]], ['3', [[17.75, 12]]],
      ['4', [[22.25, 12]]], ['5', [[22.25, 10]]], ['6', [[22.25, 8]]],
    ]);
    expect(pins('box 20,10 4x2 3').map(([name]) => name)).toEqual(['1', '2', '3']);
  });
});

describe('leaded parts', () => {
  test('run between their two ends', () => {
    const found = at('resistor 10,5 20,5 51');
    expect(found.ok && found.value).toMatchObject({ ends: [{ x: 10, y: 5 }, { x: 20, y: 5 }], angle: 0, center: { x: 15, y: 5 } });
  });

  test('say which end could not be read, and refuse two ends in one place', () => {
    const bad = at('resistor 10,5 P9 51');
    expect(!bad.ok && bad.reason).toMatch(/2 つ目の端: 読めない端: P9/);
    const same = at('resistor 10,5 10,5');
    expect(!same.ok && same.reason).toMatch(/両端が同じ点/);
  });
});

describe('catalog', () => {
  test('lists the kinds it takes and the packages of each', () => {
    expect(typeNames()).toEqual(expect.arrayContaining(['sma', 'box', 'resistor', 'bead', 'ic3']));
    expect(smdKeys('sot')).toEqual(['sot23', 'sot346', 'sot89']);
    expect(isPolar('led')).toBe(true);
    expect(isPolar('resistor')).toBe(false);
  });

  test('expands an alias that carries a look', () => {
    expect(resolveKind('ec')).toMatchObject({ ok: true, value: { kind: 'leaded', type: 'capacitor', variant: 'electrolytic' } });
  });
});
