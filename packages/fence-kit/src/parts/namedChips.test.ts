import { describe, expect, test } from 'vitest';
import { drawNamedChip, lookupNamedChip, namedChipLooks, namedChipTypes } from './namedChips.ts';

/**
 * 足に名前のある DIP 型の部品 (52 の docs/66 の段 3)。**DIP の足の位置のうち、
 * 足のある所に名前が付いた物**として 3 つのフェンスが同じ表を読む。
 * 足の並びは実物のデータシート (段 0 で確かめた)。
 */

describe('名前つきの DIP 型の表', () => {
  test('knows the relay, the photocoupler and the seven-segment display', () => {
    expect(namedChipTypes()).toEqual(['relay', 'photocoupler', 'seg7']);
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
