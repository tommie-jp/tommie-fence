import { describe, expect, test } from 'vitest';
import { lookupPinout, lookupRole, pinoutModels, pinoutTable } from './pinouts.ts';

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

  test('names the 74HC gates as printed on the TI data sheets (SN74HC04 / 08 / 32, N package)', () => {
    expect(lookupPinout('74HC04', 14)?.names).toEqual([
      '1A', '1Y', '2A', '2Y', '3A', '3Y', 'GND', '4Y', '4A', '5Y', '5A', '6Y', '6A', 'VCC',
    ]);
    const quad = ['1A', '1B', '1Y', '2A', '2B', '2Y', 'GND', '3Y', '3A', '3B', '4Y', '4A', '4B', 'VCC'];
    expect(lookupPinout('74HC08', 14)?.names).toEqual(quad);
    expect(lookupPinout('74HC32', 14)?.names).toEqual(quad);
    expect(lookupPinout('SN74HC04N', 14)?.model).toBe('74HC04');
  });

  test('names the CD4013B flip-flops, writing the barred outputs with a slash', () => {
    expect(lookupPinout('CD4013B', 14)?.names).toEqual([
      'Q1', '/Q1', 'CLOCK1', 'RESET1', 'D1', 'SET1', 'VSS', 'SET2', 'D2', 'RESET2', 'CLOCK2', '/Q2', 'Q2', 'VDD',
    ]);
  });

  test('names the CD4070B and CD40106B like the gates and inverters of the same series', () => {
    expect(lookupPinout('CD4070', 14)?.names).toEqual(lookupPinout('CD4071B', 14)?.names);
    expect(lookupPinout('CD4070', 14)?.model).toBe('CD4070B');
    expect(lookupPinout('CD40106', 14)?.names).toEqual(lookupPinout('CD4069UB', 14)?.names);
    expect(lookupPinout('CD40106', 14)?.model).toBe('CD40106B');
  });

  test('names the L293D with the commas of its enable pins dropped and the ground printed on four pins', () => {
    expect(lookupPinout('L293D', 16)?.names).toEqual([
      '12EN', '1A', '1Y', 'GROUND', 'GROUND', '2Y', '2A', 'VCC2', '34EN', '3A', '3Y', 'GROUND', 'GROUND', '4Y', '4A', 'VCC1',
    ]);
    expect(lookupPinout('L293DNE', 16)?.model).toBe('L293D');
  });

  test('names the MCP3008 as printed on the Microchip data sheet', () => {
    expect(lookupPinout('MCP3008', 16)?.names).toEqual([
      'CH0', 'CH1', 'CH2', 'CH3', 'CH4', 'CH5', 'CH6', 'CH7', 'DGND', 'CS/SHDN', 'DIN', 'DOUT', 'CLK', 'AGND', 'VREF', 'VDD',
    ]);
  });

  test('names the 74HC595 as printed on the TI data sheet (SCLS041J), the barred inputs without the bar', () => {
    expect(lookupPinout('74HC595', 16)?.names).toEqual([
      'QB', 'QC', 'QD', 'QE', 'QF', 'QG', 'QH', 'GND', "QH'", 'SRCLR', 'SRCLK', 'RCLK', 'OE', 'SER', 'QA', 'VCC',
    ]);
    expect(lookupPinout('SN74HC595N', 16)?.model).toBe('74HC595');
  });

  test('names the CD4511B with the BCD inputs and the segment outputs told apart in any case', () => {
    expect(lookupPinout('CD4511B', 16)?.names).toEqual([
      'INB', 'INC', 'LT', 'BL', 'LE/STROBE', 'IND', 'INA', 'VSS', 'Oe', 'Od', 'Oc', 'Ob', 'Oa', 'Og', 'Of', 'VDD',
    ]);
    expect(lookupPinout('CD4511', 16)?.model).toBe('CD4511B');
    expect(lookupPinout('CD4511BE', 16)?.model).toBe('CD4511B');
  });

  test('names the CD74HC283 as printed on the TI data sheet (SCHS176E)', () => {
    expect(lookupPinout('CD74HC283', 16)?.names).toEqual([
      'S1', 'B1', 'A1', 'S0', 'A0', 'B0', 'CIN', 'GND', 'COUT', 'S3', 'B3', 'A3', 'S2', 'A2', 'B2', 'VCC',
    ]);
    expect(lookupPinout('CD74HC283E', 16)?.model).toBe('CD74HC283');
    expect(lookupPinout('74HC283', 16)?.model).toBe('CD74HC283');
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
      'CD4013B', 'CD4070B', 'CD40106B', '74HC04', '74HC08', '74HC32', 'L293D', 'MCP3008',
      '74HC595', 'CD4511B', 'CD74HC283', '74HC163', '74HC154', '62256', '6116', '74HC245', '74HC273',
    ]);
    expect(pinoutModels(16)).toEqual([
      'CD4017B', 'CD4040B', 'L293D', 'MCP3008', '74HC595', 'CD4511B', 'CD74HC283', '74HC163',
    ]);
    expect(pinoutModels(20)).toEqual(['74HC245', '74HC273']);
    expect(pinoutModels(24)).toEqual(['74HC154', '6116']);
    expect(pinoutModels(28)).toEqual(['62256']);
  });

  test('hands out the whole table with every spelling, for the cheat sheet', () => {
    const table = pinoutTable();
    expect(table.map((row) => row.models[0])).toEqual(pinoutModels());
    expect(table[0]?.models).toContain('NE555P');
    expect(table.every((row) => [8, 14, 16, 20, 24, 28].includes(row.names.length))).toBe(true);
  });

  test('gives every pin a name that cannot be mistaken for a pin number or split by a space', () => {
    for (const model of pinoutModels()) {
      const names = lookupPinout(model, lookupCount(model))?.names ?? [];
      for (const name of names) {
        expect(name).not.toMatch(/^\d+$/);
        expect(name).toMatch(/^[\x21-\x7e]+$/);
        expect(name).not.toContain('.');
        expect(name).not.toContain(',');
      }
    }
  });

  test('never prints two names that differ only in case (the schematic reads pin names in any case)', () => {
    for (const model of pinoutModels()) {
      const names = [...new Set(lookupPinout(model, lookupCount(model))?.names ?? [])];
      const folded = new Set(names.map((name) => name.toUpperCase()));
      expect(folded.size, model).toBe(names.length);
    }
  });
});

describe('the counter, decoder, memory and bus chips of the CPU-like problem', () => {
  test('names the 74HC163 as printed on the TI data sheet (SCLS298D)', () => {
    expect(lookupPinout('74HC163', 16)?.names).toEqual([
      'CLR', 'CLK', 'A', 'B', 'C', 'D', 'ENP', 'GND', 'LOAD', 'ENT', 'QD', 'QC', 'QB', 'QA', 'RCO', 'VCC',
    ]);
    for (const model of ['SN74HC163', 'SN74HC163N', 'CD74HC163E', '74HC163N', 'sn74hc163n']) {
      expect(lookupPinout(model, 16)?.model, model).toBe('74HC163');
    }
    expect(lookupRole('74HC163')).toBe('4 ビット同期カウンタ (同期クリア)');
  });

  test('names the 74HC154 as printed on the TI data sheet (SCHS152D)', () => {
    const names = lookupPinout('74HC154', 24)?.names ?? [];
    expect(names).toHaveLength(24);
    expect(names.slice(0, 12)).toEqual(['Y0', 'Y1', 'Y2', 'Y3', 'Y4', 'Y5', 'Y6', 'Y7', 'Y8', 'Y9', 'Y10', 'GND']);
    expect(names.slice(12)).toEqual(['Y11', 'Y12', 'Y13', 'Y14', 'Y15', 'E1', 'E2', 'A3', 'A2', 'A1', 'A0', 'VCC']);
    expect(lookupPinout('CD74HC154E', 24)?.model).toBe('74HC154');
    expect(lookupPinout('SN74HC154N', 24)?.model).toBe('74HC154');
    expect(lookupRole('74HC154')).toBe('4 → 16 デコーダ');
  });

  test('names the 62256 as printed on the Alliance AS6C62256 data sheet', () => {
    expect(lookupPinout('62256', 28)?.names).toEqual([
      'A14', 'A12', 'A7', 'A6', 'A5', 'A4', 'A3', 'A2', 'A1', 'A0', 'DQ0', 'DQ1', 'DQ2', 'VSS',
      'DQ3', 'DQ4', 'DQ5', 'DQ6', 'DQ7', 'CE', 'A10', 'OE', 'A11', 'A9', 'A8', 'A13', 'WE', 'VCC',
    ]);
    for (const model of ['AS6C62256', 'AS6C62256-55PCN', 'HM62256', 'HM62256B']) {
      expect(lookupPinout(model, 28)?.model, model).toBe('62256');
    }
    expect(lookupRole('AS6C62256-55PCN')).toBe('SRAM 32K×8');
  });

  test('names the 6116 as printed on the IDT6116SA data sheet', () => {
    expect(lookupPinout('6116', 24)?.names).toEqual([
      'A7', 'A6', 'A5', 'A4', 'A3', 'A2', 'A1', 'A0', 'IO0', 'IO1', 'IO2', 'GND',
      'IO3', 'IO4', 'IO5', 'IO6', 'IO7', 'CS', 'A10', 'OE', 'WE', 'A9', 'A8', 'VCC',
    ]);
    expect(lookupPinout('IDT6116SA', 24)?.model).toBe('6116');
    expect(lookupRole('6116')).toBe('SRAM 2K×8');
  });

  test('names the 74HC245 and 74HC273 as printed on the TI data sheets', () => {
    expect(lookupPinout('74HC245', 20)?.names).toEqual([
      'DIR', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'GND', 'B8', 'B7', 'B6', 'B5', 'B4', 'B3', 'B2', 'B1', 'OE', 'VCC',
    ]);
    expect(lookupPinout('SN74HC245N', 20)?.model).toBe('74HC245');
    expect(lookupRole('74HC245')).toBe('8 ビット バス トランシーバ');
    expect(lookupPinout('74HC273', 20)?.names).toEqual([
      'CLR', '1Q', '1D', '2D', '2Q', '3Q', '3D', '4D', '4Q', 'GND', 'CLK', '5Q', '5D', '6D', '6Q', '7Q', '7D', '8D', '8Q', 'VCC',
    ]);
    expect(lookupPinout('CD74HC273E', 20)?.model).toBe('74HC273');
    expect(lookupRole('74HC273')).toBe('8 ビット D フリップフロップ (クリア付き)');
  });

  test('answers null when the package does not match', () => {
    expect(lookupPinout('74HC163', 14)).toBeNull();
    expect(lookupPinout('62256', 24)).toBeNull();
  });
});

/** 表の行の足の本数 (8〜28 の DIP のどれか)。 */
function lookupCount(model: string): number {
  return [8, 14, 16, 20, 24, 28].find((count) => lookupPinout(model, count) !== null) ?? 0;
}

describe('lookupRole', () => {
  test('names what the chip does, the way its datasheet title says it', () => {
    expect(lookupRole('CD4081')).toBe('2 入力 AND ×4');
    expect(lookupRole('cd4069ube')).toBe('NOT ×6');
    expect(lookupRole('NE555')).toBe('タイマー');
  });

  test('says nothing for a model that is not in the table', () => {
    expect(lookupRole('XYZ123')).toBeNull();
    expect(lookupRole(null)).toBeNull();
  });

  test('gives every row of the table a role', () => {
    for (const row of pinoutTable()) expect(row.role, row.models[0]).not.toBe('');
  });
});
