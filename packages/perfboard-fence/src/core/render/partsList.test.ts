import { describe, expect, test } from 'vitest';
import { bandText, partsListing } from './partsList.ts';
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

  test('lists the devices off the board — they still have to be bought', () => {
    const rows = partsListing([], [device('BAT', '電池 3V')]);

    expect(rows[1]).toEqual(['BAT', 'device', '電池 3V', '']);
  });

  test('keeps the order they were written in, so the drawing can be followed', () => {
    const rows = partsListing(
      [part('R2', 'resistor', '1k'), part('R1', 'resistor', '2k')],
      [device('SPK', 'スピーカー')],
    );

    expect(rows.slice(1).map((row) => row[0])).toEqual(['R2', 'R1', 'SPK']);
  });

  test('returns nothing at all when there is nothing to list', () => {
    // 見出しだけの表を出すと、帯の場所を取るだけで何も言わない。
    expect(partsListing([], [])).toEqual([]);
  });
});
