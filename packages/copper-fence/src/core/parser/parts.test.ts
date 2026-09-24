import { describe, expect, test } from 'vitest';
import { parsePartLine } from './parts.ts';

const read = (text: string) => parsePartLine('U1', text);
const reason = (text: string): string => {
  const result = read(text);
  return result.ok ? '' : result.error.message;
};

describe('sma', () => {
  test('sits on a side of the board, at a distance along it', () => {
    const plain = read('sma left 10 CH0');
    expect(plain.ok && plain.value).toMatchObject({ kind: 'edge', type: 'sma', variant: 'female-edge', side: 'left', offset: 10, value: 'CH0' });
    const male = read('sma/male-edge top 12.5');
    expect(male.ok && male.value).toMatchObject({ variant: 'male-edge', side: 'top', offset: 12.5, value: null });
  });

  test('is only edge-mounted on this board', () => {
    expect(reason('sma/female left 10')).toMatch(/端面実装です/);
    expect(reason('sma 10,10')).toMatch(/載せる辺を書きます/);
    expect(reason('sma left')).toMatch(/辺に沿った位置/);
  });
});

describe('surface mount', () => {
  test('sits at a point, with an optional turn', () => {
    const chip = read('capacitor/1608 20,10 10p');
    expect(chip.ok && chip.value).toMatchObject({ kind: 'chip', type: 'capacitor', variant: '1608', at: { x: 20, y: 10 }, orient: null, value: '10p' });
    const shunt = read('c/2012 20,12 r90 100n 50V');
    expect(shunt.ok && shunt.value).toMatchObject({ type: 'capacitor', variant: '2012', orient: { turn: 90, mirror: false }, value: '100n 50V' });
    const mmic = read('ic3/sot89 15,12 r180 mirror SPF5189Z');
    expect(mmic.ok && mmic.value).toMatchObject({ kind: 'sot', orient: { turn: 180, mirror: true }, value: 'SPF5189Z' });
  });

  test('takes chip coils and beads, which RF boards use', () => {
    expect(read('inductor/1608 1,1').ok).toBe(true);
    expect(read('bead/1608 1,1').ok).toBe(true);
    expect(read('diode/sod323 1,1').ok).toBe(true);
  });

  test('points to the right spelling of an alias', () => {
    expect(reason('resistor/0603 1,1')).toMatch(/0603 は 1608 と書きます/);
    expect(reason('transistor/s-mini 1,1')).toMatch(/sot346/);
  });

  test('refuses a package that does not carry the part, and rows of pins', () => {
    expect(reason('transistor/1608 1,1')).toMatch(/1608 に載る種類は/);
    expect(reason('dip8/sop 1,1')).toMatch(/box で書きます|知らない種類/);
    expect(reason('capacitor/1608 here')).toMatch(/中心として読めません/);
    expect(reason('capacitor/1608')).toMatch(/中心を x,y/);
  });

  test('asks for the package of a part that only comes surface-mounted here', () => {
    expect(reason('transistor 1,1')).toMatch(/transistor は姿を書きます \(transistor\/sot23/);
    expect(reason('bead 1,1 2,2')).toMatch(/bead は姿を書きます/);
  });
});

describe('box', () => {
  test('has a centre, a size and a number of pins', () => {
    const saw = read('box 20,10 5x5 6 r90 SAW433');
    expect(saw.ok && saw.value).toMatchObject({ kind: 'box', at: { x: 20, y: 10 }, width: 5, height: 5, pins: 6, orient: { turn: 90 }, value: 'SAW433' });
  });

  test('says what is missing', () => {
    expect(reason('box 20,10')).toMatch(/箱の大きさ/);
    expect(reason('box 20,10 5x5')).toMatch(/足の数/);
    expect(reason('box 20,10 5x5 0')).toMatch(/足の数/);
    expect(reason('box/qfn 20,10 5x5 6')).toMatch(/box に姿はありません/);
  });
});

describe('leaded parts', () => {
  test('run from one end to the other (an island or a point)', () => {
    const r = read('resistor P1 P2 51');
    expect(r.ok && r.value).toMatchObject({ kind: 'leaded', type: 'resistor', variant: null, ends: ['P1', 'P2'], value: '51' });
    const c = read('capacitor/ceramic 10,5 20,5');
    expect(c.ok && c.value).toMatchObject({ variant: 'ceramic', ends: ['10,5', '20,5'] });
  });

  test('says what is missing or wrong', () => {
    expect(reason('resistor P1')).toMatch(/端を 2 つ書きます/);
    expect(reason('resistor 10.123,5 P2')).toMatch(/小数は 2 桁まで/);
    expect(reason('capacitor/huge P1 P2')).toMatch(/capacitor の姿は/);
    expect(reason('crystal/bent P1 P2')).toMatch(/crystal の姿は/);
    expect(reason('fuse/axial P1 P2')).toMatch(/fuse に姿は書けません: axial/);
  });
});

test('names an unknown kind, and says an empty line is empty', () => {
  expect(reason('flux 1,1')).toMatch(/知らない種類です: flux/);
  expect(reason('')).toMatch(/中身が書かれていません/);
});

test('caps the size of a box like any other shape', () => {
  const read = parsePartLine('U1', 'box 10,10 1x900 1');
  expect(read.ok ? '' : read.error.message).toMatch(/0.05〜100/);
});
