import { describe, expect, test } from 'vitest';
import { lookupPinout, pinoutModels, pinoutTable } from './pinouts.ts';

/**
 * DIP の足の名前の表 (52 の docs/95 の段 1)。**型番で引いて、3 つのフェンスが
 * 同じ名前を刷る**。名前は TI のデータシートの端子図の印字 (段 0 で確かめた)。
 */

describe('足の名前の表', () => {
  test('names the eight pins of the NE555 as printed on the TI data sheet', () => {
    expect(lookupPinout('NE555', 8)).toEqual({
      model: 'NE555',
      names: ['GND', 'TRIG', 'OUT', 'RESET', 'CONT', 'THRES', 'DISCH', 'VCC'],
    });
  });

  test('keeps the TLC555 apart from the NE555 because its supply pin reads VDD', () => {
    expect(lookupPinout('TLC555', 8)?.names[7]).toBe('VDD');
    expect(lookupPinout('NE555', 8)?.names[7]).toBe('VCC');
  });

  test('keeps the TL071 and the TL072 apart (one amplifier and two)', () => {
    expect(lookupPinout('TL071', 8)?.names).toEqual(['NC', 'IN-', 'IN+', 'VCC-', 'NC', 'OUT', 'VCC+', 'NC']);
    expect(lookupPinout('TL072', 8)?.names).toEqual(['1OUT', '1IN-', '1IN+', 'VCC-', '2IN+', '2IN-', '2OUT', 'VCC+']);
    expect(lookupPinout('LM358', 8)?.names).toEqual(['OUT1', 'IN1-', 'IN1+', 'V-', 'IN2+', 'IN2-', 'OUT2', 'V+']);
  });

  test('names the CMOS counters and gates', () => {
    expect(lookupPinout('CD4017B', 16)?.names).toEqual([
      'Q5', 'Q1', 'Q0', 'Q2', 'Q6', 'Q7', 'Q3', 'VSS', 'Q8', 'Q4', 'Q9', 'CO', 'INH', 'CLOCK', 'RESET', 'VDD',
    ]);
    expect(lookupPinout('CD4040B', 16)?.names).toEqual([
      'Q12', 'Q6', 'Q5', 'Q7', 'Q4', 'Q3', 'Q2', 'VSS', 'Q1', 'CLOCK', 'R', 'Q9', 'Q8', 'Q10', 'Q11', 'VDD',
    ]);
    expect(lookupPinout('CD4069UB', 14)?.names).toEqual([
      'A', 'G', 'B', 'H', 'C', 'I', 'VSS', 'J', 'D', 'K', 'E', 'L', 'F', 'VDD',
    ]);
    const quad = ['A', 'B', 'J', 'K', 'C', 'D', 'VSS', 'E', 'F', 'L', 'M', 'G', 'H', 'VDD'];
    for (const model of ['CD4071B', 'CD4081B', 'CD4011B', 'CD4001B']) {
      expect(lookupPinout(model, 14)?.names).toEqual(quad);
    }
  });

  test('finds a model by any of its listed spellings and answers the first one', () => {
    expect(lookupPinout('NE555P', 8)?.model).toBe('NE555');
    expect(lookupPinout('CD4017', 16)?.model).toBe('CD4017B');
    expect(lookupPinout('CD4017BE', 16)?.model).toBe('CD4017B');
  });

  test('reads the model in any case, but the spelling must match whole', () => {
    expect(lookupPinout('ne555', 8)?.model).toBe('NE555');
    expect(lookupPinout('  NE555 ', 8)?.model).toBe('NE555');
    // 接尾辞を削らない — TL071 と TL072 を取り違えないため。
    expect(lookupPinout('TL07', 8)).toBeNull();
    expect(lookupPinout('NE555XYZ', 8)).toBeNull();
  });

  test('answers null when the number of pins does not match the package', () => {
    expect(lookupPinout('NE555', 14)).toBeNull();
    expect(lookupPinout('CD4017B', 8)).toBeNull();
  });

  test('answers null for no model, an unknown one and inherited names', () => {
    expect(lookupPinout(null, 8)).toBeNull();
    expect(lookupPinout('', 8)).toBeNull();
    expect(lookupPinout('LM741', 8)).toBeNull();
    expect(lookupPinout('constructor', 8)).toBeNull();
    expect(lookupPinout('__proto__', 8)).toBeNull();
  });

  test('lists the models it knows, one spelling per row, optionally for one package', () => {
    expect(pinoutModels()).toEqual([
      'NE555', 'TLC555', 'LM358', 'TL071', 'TL072',
      'CD4017B', 'CD4040B', 'CD4069UB', 'CD4071B', 'CD4081B', 'CD4011B', 'CD4001B',
    ]);
    expect(pinoutModels(16)).toEqual(['CD4017B', 'CD4040B']);
    expect(pinoutModels(20)).toEqual([]);
  });

  test('hands out the whole table with every spelling, for the cheat sheet', () => {
    const table = pinoutTable();
    expect(table.map((row) => row.models[0])).toEqual(pinoutModels());
    expect(table[0]?.models).toContain('NE555P');
    expect(table.every((row) => [8, 14, 16].includes(row.names.length))).toBe(true);
  });

  test('gives every pin a name that cannot be mistaken for a pin number or split by a space', () => {
    for (const model of pinoutModels()) {
      const names = lookupPinout(model, lookupCount(model))?.names ?? [];
      for (const name of names) {
        expect(name).not.toMatch(/^\d+$/);
        expect(name).toMatch(/^[\x21-\x7e]+$/);
        expect(name).not.toContain('.');
      }
    }
  });
});

/** 表の行の足の本数 (8・14・16 のどれか)。 */
function lookupCount(model: string): number {
  return [8, 14, 16].find((count) => lookupPinout(model, count) !== null) ?? 0;
}
