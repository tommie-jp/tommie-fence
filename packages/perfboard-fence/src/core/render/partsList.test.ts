import { describe, expect, test } from 'vitest';
import { bandColors, boardRow, capacitorMark, partsListing } from './partsList.ts';
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

describe('bandColors', () => {
  test('lists the colours of the bands, to be drawn as swatches', () => {
    // Arrange / Act / Assert — 10k は茶黒橙、許容差の既定 (±1%) が茶。
    expect(bandColors('resistor', '10k')).toEqual(['brown', 'black', 'orange', 'brown']);
  });

  test('follows the tolerance written after the value', () => {
    expect(bandColors('resistor', '47k 5%')).toEqual(['yellow', 'violet', 'orange', 'gold']);
  });

  test('says nothing when the value cannot be read as a resistance', () => {
    // 実物と違う帯を書くと、図を信じた人が違う抵抗を挿す (図の帯と同じ約束)。
    expect(bandColors('resistor', 'ほどほど')).toEqual([]);
    expect(bandColors('resistor', null)).toEqual([]);
  });

  test('says nothing for parts that carry no colour code', () => {
    expect(bandColors('capacitor', '10n')).toEqual([]);
    expect(bandColors('led', 'red')).toEqual([]);
  });
});

describe('capacitorMark', () => {
  test('gives the three-digit code printed on the body', () => {
    expect(capacitorMark('capacitor', 'ceramic', '100n')).toBe('104');
    expect(capacitorMark('capacitor', 'ceramic', '1u')).toBe('105');
    expect(capacitorMark('capacitor', 'ceramic', '560p')).toBe('561');
    expect(capacitorMark('capacitor', 'ceramic', '1.2n')).toBe('122');
  });

  test('gives nothing for electrolytics, which print the value itself', () => {
    expect(capacitorMark('capacitor', 'electrolytic', '10u')).toBe('');
  });

  test('gives nothing for values three digits cannot hold, or other parts', () => {
    expect(capacitorMark('capacitor', 'ceramic', '4.7p')).toBe('');
    expect(capacitorMark('resistor', null, '10k')).toBe('');
  });
});

describe('boardRow', () => {
  const plain = { cols: 18, rows: 24, slots: false, silk: 'fence', color: null, land: null, slotColor: null, h: 1.6, material: 'FR-4' } as const;

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

    expect(rows[0]).toEqual(['部品', '種類', '値', '色・記号']);
    expect(rows[1]).toEqual(['R1', 'resistor', '10k', ['brown', 'black', 'orange', 'brown']]);
  });

  test('carries the package into the kind, the way the drawing shows it', () => {
    const rows = partsListing([part('C2', 'capacitor', '10n', 'ceramic')], []);

    expect(rows[1]?.[1]).toBe('capacitor/ceramic');
    expect(rows[1]?.[3]).toBe('103');
  });

  test('names a ceramic filter by what it is, not by its pin count', () => {
    const rows = partsListing([part('FL1', 'sip3', 'SFU455B')], []);

    expect(rows[1]?.[1]).toBe('セラミックフィルター');
    expect(rows[1]?.[2]).toBe('SFU455B (455 kHz)');
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
