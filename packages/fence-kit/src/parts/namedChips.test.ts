import { describe, expect, test } from 'vitest';
import { drawNamedChip, lookupNamedChip, namedChipLooks, namedChipTypes } from './namedChips.ts';

/**
 * 足に名前のある DIP 型の部品 (52 の docs/66 の段 3)。**DIP の足の位置のうち、
 * 足のある所に名前が付いた物**として 3 つのフェンスが同じ表を読む。
 * 足の並びは実物のデータシート (段 0 で確かめた)。
 */

describe('名前つきの DIP 型の表', () => {
  test('knows the relay, the photocoupler and the seven-segment display', () => {
    expect(namedChipTypes()).toEqual(['relay', 'photocoupler', 'seg7', 'dip-switch4', 'dip-switch8']);
    expect(namedChipLooks('relay')).toEqual(['g5v-2']);
  });

  test('puts the G5V-2 on eight of the sixteen DIP places, across three holes', () => {
    const relay = lookupNamedChip('relay', null);

    expect(relay).toMatchObject({ name: 'G5V-2', positions: 16, rowSpan: 3 });
    expect(relay?.pins).toEqual([
      { at: 1, name: 'A1' }, { at: 4, name: 'COM1' }, { at: 6, name: 'NC1' }, { at: 8, name: 'NO1' },
      { at: 9, name: 'NO2' }, { at: 11, name: 'NC2' }, { at: 13, name: 'COM2' }, { at: 16, name: 'A2' },
    ]);
  });

  test('puts the PC817 on a DIP4 and the 5161AS on two rows six holes apart', () => {
    expect(lookupNamedChip('photocoupler', 'pc817')?.pins.map((pin) => pin.name)).toEqual(['A', 'K', 'E', 'C']);
    const display = lookupNamedChip('seg7', null);
    expect(display).toMatchObject({ positions: 10, rowSpan: 6 });
    expect(display?.pins.map((pin) => pin.name)).toEqual(['e', 'd', 'COM1', 'c', 'dp', 'b', 'a', 'COM2', 'f', 'g']);
  });

  test('puts a DIP switch on every place of a DIP, one switch between the facing legs', () => {
    const four = lookupNamedChip('dip-switch4', null);
    expect(four).toMatchObject({ kindName: 'DIP スイッチ', prefix: 'SW', positions: 8, rowSpan: 3, body: 'switch' });
    // k 番のスイッチは k 番の足 (Ak) と、向かいの足 (Bk) の間。
    expect(four?.pins.map((pin) => pin.name)).toEqual(['A1', 'A2', 'A3', 'A4', 'B4', 'B3', 'B2', 'B1']);

    const eight = lookupNamedChip('dip-switch8', null);
    expect(eight).toMatchObject({ positions: 16, rowSpan: 3 });
    expect(eight?.pins[0]).toEqual({ at: 1, name: 'A1' });
    expect(eight?.pins[15]).toEqual({ at: 16, name: 'B1' });
    expect(eight?.pins[8]).toEqual({ at: 9, name: 'B8' });
  });

  test('answers null for a kind or a look it does not know, and for inherited names', () => {
    expect(lookupNamedChip('relay', 'g5v-1')).toBeNull();
    expect(lookupNamedChip('dip8', null)).toBeNull();
    expect(lookupNamedChip('constructor', null)).toBeNull();
    expect(namedChipLooks('toString')).toEqual([]);
  });
});

describe('名前つきの DIP 型の絵', () => {
  const INK = { body: '#222', pin: '#ccc', chipText: '#fff', plate: '#eee', outside: '#000', halo: '#fff', haloWidth: 2 };
  const row = (y: number, count: number) => Array.from({ length: count }, (_, index) => ({ x: 100 + index * 20, y }));

  test('names the pins and prints the part name on a relay', () => {
    const chip = lookupNamedChip('relay', null)!;
    const svg = drawNamedChip({
      chip, points: [...row(100, 4), ...row(160, 4)], names: ['A1', 'COM1', 'NC1', 'NO1', 'NO2', 'NC2', 'COM2', 'A2'],
      pitch: 20, caption: 'G5V-2', scale: 1, ink: INK,
    });

    expect(svg).toContain('COM1');
    expect(svg).toContain('G5V-2');
    // 名前の外側に DIP の番号も刷る (52 の docs/95 の決め 2)。COM1 は 4 番、NO2 は 9 番。
    expect(svg).toMatch(/>4<\/text>/);
    expect(svg).toMatch(/>9<\/text>/);
  });

  test('prints the numbers of a photocoupler too, but not on the face of a display', () => {
    const coupler = lookupNamedChip('photocoupler', null)!;
    const svg = drawNamedChip({
      chip: coupler, points: [...row(100, 2), ...row(160, 2)], names: ['A', 'K', 'E', 'C'],
      pitch: 20, caption: 'PC817', scale: 1, ink: INK,
    });
    expect(svg).toMatch(/>1<\/text>/);
    expect(svg).toMatch(/>K<\/text>/);

    const display = drawNamedChip({
      chip: lookupNamedChip('seg7', null)!, points: [...row(100, 5), ...row(220, 5).reverse()],
      names: ['e', 'd', 'COM1', 'c', 'dp', 'b', 'a', 'COM2', 'f', 'g'],
      pitch: 20, caption: '5161AS', scale: 1, ink: INK,
    });
    expect(display).not.toMatch(/>3<\/text>/);
  });

  test('draws one slider per switch on a DIP switch, with the numbers and the names of the legs', () => {
    const chip = lookupNamedChip('dip-switch4', null)!;
    const svg = drawNamedChip({
      chip, points: [...row(160, 4), ...row(100, 4).reverse()], names: chip.pins.map((pin) => pin.name),
      pitch: 20, caption: 'DIP SW', scale: 1, ink: INK,
    });

    expect(svg.match(/class="dip-switch-slot"/g)).toHaveLength(4);
    expect(svg.match(/class="dip-switch-knob"/g)).toHaveLength(4);
    // 品名は胴に刷らない (つまみの置き場)。部品リストとキャプションに出る。
    expect(svg).not.toContain('DIP SW');
    expect(svg).toMatch(/>A1<\/text>/);
    expect(svg).toMatch(/>8<\/text>/);
  });

  test('draws the face of the display instead of its name', () => {
    const chip = lookupNamedChip('seg7', null)!;
    const svg = drawNamedChip({
      chip, points: [...row(100, 5), ...row(220, 5).reverse()],
      names: ['e', 'd', 'COM1', 'c', 'dp', 'b', 'a', 'COM2', 'f', 'g'],
      pitch: 20, caption: '5161AS', scale: 1, ink: INK,
    });

    expect(svg).not.toContain('5161AS');
    // 桁の上は 6〜10 番の列 (y = 220 の側) — 下向きなので 180 度回る。
    expect(svg).toContain('rotate(180)');
  });
});
