import { describe, expect, test } from 'vitest';
import { bandText, boardRow, partsListing } from './partsList.ts';
import type { ListedPart } from './partsList.ts';
import type { DeviceSpec } from '../types.ts';

const part = (
  id: string,
  type: string,
  value: string | null = null,
  variant: string | null = null,
): ListedPart => ({ id, type, variant, value });

const device = (id: string, label: string): DeviceSpec =>
  ({ id, at: 'top', where: null, label, pins: ['+', '-'], line: 1 });

describe('bandText', () => {
  test('names the bands of a resistor in the words used to pick one out of a box', () => {
    // Arrange / Act / Assert — 10k は茶黒橙、許容差の既定 (±1%) が茶。
    expect(bandText('resistor', '10k')).toBe('茶黒橙茶');
  });

  test('follows the tolerance written after the value', () => {
    expect(bandText('resistor', '47k 5%')).toBe('黄紫橙金');
  });

  test('says nothing when the value cannot be read as a resistance', () => {
    // 実物と違う帯を書くと、図を信じた人が違う抵抗を挿す (図の帯と同じ約束)。
    expect(bandText('resistor', 'ほどほど')).toBe('');
    expect(bandText('resistor', null)).toBe('');
  });

  test('says nothing for parts that carry no colour code', () => {
    expect(bandText('capacitor', '10n')).toBe('');
    expect(bandText('led', 'red')).toBe('');
  });
});

describe('boardRow', () => {
  const plain = { cols: 18, rows: 24, slots: false, color: null, land: null, slotColor: null, h: 1.6, material: 'FR-4' } as const;

  test('names the board, its holes, thickness and base material', () => {
    expect(boardRow(plain, '5x7cm')).toEqual(['基板', 'perfboard', '5x7cm (18×24 穴) 1.6mm FR-4', '']);
  });

  test('falls back to the hole count when the board was written as one', () => {
    expect(boardRow({ ...plain, cols: 25, rows: 15, h: 0.8, material: 'CEM-3' }, null))
      .toEqual(['基板', 'perfboard', '25×15 穴 0.8mm CEM-3', '']);
  });

  test('sits right under the headings, ahead of the sorted parts', () => {
    const rows = partsListing([part('R1', 'resistor', '10k')], [], boardRow(plain, null));

    expect(rows.map((row) => row[0])).toEqual(['部品', '基板', 'R1']);
  });

  test('prints no table for a board alone', () => {
    expect(partsListing([], [], boardRow(plain, null))).toEqual([]);
  });
});

describe('partsListing', () => {
  test('heads the table, so the columns can be read without the drawing', () => {
    const rows = partsListing([part('R1', 'resistor', '10k')], []);

    expect(rows[0]).toEqual(['部品', '種類', '値', '色']);
    expect(rows[1]).toEqual(['R1', 'resistor', '10k', '茶黒橙茶']);
  });

  test('carries the package into the kind, the way the drawing shows it', () => {
    const rows = partsListing([part('C2', 'capacitor', '10n', 'ceramic')], []);

    expect(rows[1]?.[1]).toBe('capacitor/ceramic');
  });

  test('adds what an IC does after its model, so the table says which chip is which', () => {
    const rows = partsListing([part('U1', 'dip14', 'CD4081')], []);

    expect(rows[1]?.[2]).toBe('CD4081 (2 入力 AND ×4)');
  });

  test('lists the devices off the board — they still have to be bought', () => {
    const rows = partsListing([], [device('BAT', '電池 3V')]);

    expect(rows[1]).toEqual(['BAT', 'device', '電池 3V', '']);
  });

  test('sorts the rows by name, numbers as numbers, devices among the parts', () => {
    // 表から部品を探すので名前の順に並べる (R2 の次は R10。機器も同じ並びに入る)。
    const rows = partsListing(
      [part('R10', 'resistor', '1k'), part('U1', 'dip8'), part('R2', 'resistor', '2k'), part('D1', 'led', 'red')],
      [device('BAT', '電池 3V')],
    );

    expect(rows.slice(1).map((row) => row[0])).toEqual(['BAT', 'D1', 'R2', 'R10', 'U1']);
  });

  test('returns nothing at all when there is nothing to list', () => {
    // 見出しだけの表を出すと、帯の場所を取るだけで何も言わない。
    expect(partsListing([], [])).toEqual([]);
  });
});
