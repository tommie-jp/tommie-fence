import { describe, expect, test } from 'vitest';
import {
  SMD_PX_PER_MM, adapterFor, directSotSpec, isDirectSmd, isSmdAdapter, smdLook, smdLooksOf, smdMount, smdOffsets,
  smdSpelling, smdSuggestion, smdTable, withSmdLooks,
} from './smd.ts';

/**
 * 面実装の表 (52 の docs/64)。**表に 1 行足せば姿が 1 つ増える**ので、見張るのは
 * 綴りの規則 (`-dip` は変換基板、裸は直付け) と、板ごとに受け取る姿の違い。
 */
describe('面実装の表', () => {
  test('knows S-Mini as sot346, on an adapter and soldered straight to the board', () => {
    expect(smdLook('sot346-dip')).toMatchObject({ key: 'sot346', onAdapter: true });
    expect(smdLook('sot346')).toMatchObject({ key: 'sot346', onAdapter: false });
    expect(smdLook('sot346')?.spec).toMatchObject({ kind: 'sot', pitch: 0.95, width: 1.6 });
  });

  test('tells SOT-346 from SOT-23 by the body, which is 0.3mm wider', () => {
    const narrow = smdLook('sot23')?.spec;
    const wide = smdLook('sot346')?.spec;
    expect(narrow?.kind === 'sot' && wide?.kind === 'sot' && wide.width - narrow.width).toBeCloseTo(0.3);
  });

  test('keeps the old sot23-dip spelling', () => {
    expect(isSmdAdapter('sot23-dip')).toBe(true);
  });

  test('reads a bare IC name on a DIP as an adapter, and refuses -dip on it', () => {
    expect(smdLook('sop')).toMatchObject({ key: 'sop', onAdapter: true });
    expect(smdLook('sop-dip')).toBeNull();
  });

  test('refuses the shapes the table does not have', () => {
    expect(smdLook('1608-dip')).toBeNull(); // チップを載せる変換基板は無い
    expect(smdLook('sot89')).toBeNull(); // SOT-89 の直付けは後回し
    expect(smdLook('to92')).toBeNull();
    expect(smdLook(null)).toBeNull();
    expect(smdLook('constructor')).toBeNull();
  });

  test('gives the breadboard only the adapters, and the perfboard the direct shapes too', () => {
    expect(smdLooksOf('transistor', 'breadboard')).toEqual(['sot23-dip', 'sot346-dip', 'sot89-dip']);
    expect(smdLooksOf('transistor', 'perfboard')).toEqual(['sot23-dip', 'sot346-dip', 'sot89-dip', 'sot23', 'sot346']);
    expect(smdLooksOf('resistor', 'breadboard')).toEqual([]);
    expect(smdLooksOf('resistor', 'perfboard')).toEqual(['1608', '2012', '3216']);
    expect(smdLooksOf('led', 'perfboard')).toEqual(['1608', '2012']);
    expect(smdLooksOf('dip8', 'breadboard')).toEqual(['sop', 'tssop']);
    expect(smdLooksOf('dip40', 'perfboard')).toEqual(['sop', 'tssop']);
    expect(smdLooksOf('sip8', 'perfboard')).toEqual([]);
  });

  test('keeps the chip sizes in the order people read them', () => {
    // 数字だけの見出しはオブジェクトに入れると先頭へ並び替わる。表の順のまま出ること。
    expect(smdTable().map(([key]) => key).slice(0, 4)).toEqual(['sot23', 'sot346', 'sot89', '1608']);
  });

  test('tells direct shapes from adapters', () => {
    expect(isDirectSmd('2012')).toBe(true);
    expect(isDirectSmd('sot346')).toBe(true);
    expect(isDirectSmd('sot346-dip')).toBe(false);
    expect(isDirectSmd('sop')).toBe(false);
    expect(isSmdAdapter('sop')).toBe(false); // 3 本足の変換基板だけ
  });

  test('points a direct shape at its adapter, for the breadboard to suggest', () => {
    expect(adapterFor('transistor', 'sot346')).toBe('sot346-dip');
    expect(adapterFor('regulator', 'sot23')).toBe('sot23-dip');
    expect(adapterFor('resistor', '2012')).toBeNull();
    expect(adapterFor('transistor', 'sot346-dip')).toBeNull();
    // 直付けを持たない物も、変換基板のことを言っているかもしれないので引ける。
    expect(adapterFor('transistor', 'sot89')).toBe('sot89-dip');
    expect(adapterFor('regulator', 'sot346')).toBeNull(); // その種類の変換基板が無い
    expect(adapterFor('dip8', 'sop')).toBeNull();
  });

  test('suggests the same rewrite on both boards, from the table they can write', () => {
    const perfboard = smdLooksOf('transistor', 'perfboard');
    const breadboard = smdLooksOf('transistor', 'breadboard');
    expect(smdSuggestion('transistor', 's-mini', perfboard)).toBe('sot346');
    expect(smdSuggestion('transistor', 's-mini', breadboard)).toBe('sot346-dip');
    expect(smdSuggestion('transistor', 'sot89', perfboard)).toBe('sot89-dip');
    expect(smdSuggestion('transistor', 'sot346', breadboard)).toBe('sot346-dip');
    expect(smdSuggestion('diode', '2012', smdLooksOf('diode', 'perfboard'))).toBeNull();
    expect(smdSuggestion('transistor', 'nonsense', perfboard)).toBeNull();
  });

  test('adds the surface-mount looks after the through-hole ones', () => {
    expect(withSmdLooks({ transistor: ['to92'], sma: ['male'] }, 'breadboard'))
      .toEqual({ transistor: ['to92', 'sot23-dip', 'sot346-dip', 'sot89-dip'], sma: ['male'] });
  });

  test('finds the SOT soldered straight on, and nothing else', () => {
    expect(directSotSpec('sot346')).toMatchObject({ kind: 'sot', width: 1.6 });
    expect(directSotSpec('sot346-dip')).toBeNull();
    expect(directSotSpec('2012')).toBeNull();
    expect(directSotSpec(null)).toBeNull();
  });

  test('spells the other names the way the table does, for the hint only', () => {
    expect(smdSpelling('S-Mini')).toBe('sot346');
    expect(smdSpelling('sc-59')).toBe('sot346');
    expect(smdSpelling('SC59-dip')).toBe('sot346-dip');
    expect(smdSpelling('0805')).toBe('2012');
    expect(smdSpelling('SMA')).toBe('do214ac');
    expect(smdSpelling('soic')).toBe('sop');
    expect(smdSpelling('SOIC-dip')).toBe('sop');
    expect(smdSpelling('nonsense')).toBeNull();
    expect(smdSpelling('-')).toBeNull();
  });

  test('lays the legs out from one hole, the way each shape is soldered', () => {
    expect(smdOffsets('2012')).toEqual([{ row: 0, col: 0 }, { row: 0, col: 1 }]);
    expect(smdOffsets('do214ac')).toEqual([{ row: 0, col: 0 }, { row: 0, col: 2 }]);
    expect(smdOffsets('sot346')).toEqual([{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 1, col: 0 }]);
    expect(smdOffsets('sot346-dip')).toBeNull();
    expect(smdOffsets(null)).toBeNull();
    expect(smdMount('sod123')).toBe('adjacent');
    expect(smdMount('sot23-dip')).toBeNull();
  });

  test('draws a millimetre as the boards do (2.54mm = 20px)', () => {
    expect(SMD_PX_PER_MM * 2.54).toBeCloseTo(20);
  });
});
