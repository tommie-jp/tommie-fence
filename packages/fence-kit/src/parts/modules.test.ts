import { describe, expect, test } from 'vitest';
import { deviceRole, lookupModule, moduleModels, moduleTable, resolveDeviceModel } from './modules.ts';

/** 基板の外のモジュールの表 (52 の docs/139)。並びはヘッダ・端子の物理の並び。 */
describe('基板の外のモジュールの表', () => {
  test.each([
    ['MBC2596-01', ['IN+', 'IN-', 'OUT+', 'OUT-']],
    ['28BYJ-48', ['BLUE', 'PINK', 'YELLOW', 'ORANGE', 'RED']],
    ['NRF24L01+', ['GND', 'VCC', 'CE', 'CSN', 'SCK', 'MOSI', 'MISO', 'IRQ']],
    ['EC11', ['A', 'C', 'B', 'D', 'E']],
    ['03962A', ['IN+', 'IN-', 'OUT+', 'B+', 'B-', 'OUT-']],
  ] as const)('names the pins of %s in the physical order', (model, names) => {
    expect(lookupModule(model)?.names).toEqual(names);
  });

  test('accepts the spellings people type, in any case', () => {
    expect(lookupModule('nrf24l01')?.models[0]).toBe('NRF24L01+');
    expect(lookupModule('LM2596-01')?.models[0]).toBe('MBC2596-01');
    expect(lookupModule('pololu-2130')?.models[0]).toBe('DRV8833-POLOLU');
    expect(lookupModule('constructor')).toBeNull();
  });

  test('keeps every row complete: unique spellings, unique pin names, a product, a view and a source', () => {
    const seen = new Set<string>();
    for (const row of moduleTable()) {
      for (const model of row.models) {
        expect(seen.has(model.toUpperCase()), model).toBe(false);
        seen.add(model.toUpperCase());
      }
      expect(new Set(row.names).size, row.models[0]).toBe(row.names.length);
      expect(row.names.every((name) => /^[\w+-]+$/.test(name) && !/^\d+$/.test(name)), row.models[0]).toBe(true);
      for (const text of [row.role, row.roleEn, row.product, row.view, row.source]) expect(text.trim(), row.models[0]).not.toBe('');
    }
    expect(moduleModels()).toEqual(moduleTable().map((row) => row.models[0]));
  });

  test('names the role in both languages, falling back to the pin name table', () => {
    expect(deviceRole('EC11')).toBe('ロータリーエンコーダ (押しスイッチつき)');
    expect(deviceRole('EC11', 'en')).toBe('rotary encoder (with push switch)');
    expect(deviceRole('HC-SR04')).toBe('超音波距離センサのモジュール');
    expect(deviceRole('XYZ123')).toBeNull();
  });
});

describe('機器の model: からピンを決める', () => {
  test('gives the whole table in order when no pins are written', () => {
    expect(resolveDeviceModel('mbc2596-01', null)).toEqual({ ok: true, model: 'MBC2596-01', names: ['IN+', 'IN-', 'OUT+', 'OUT-'] });
  });

  test('keeps the written pins in the written order when every one is in the table', () => {
    expect(resolveDeviceModel('NRF24L01+', ['VCC', 'GND', 'CE'])).toEqual({ ok: true, model: 'NRF24L01+', names: ['VCC', 'GND', 'CE'] });
  });

  test('refuses a pin that is not in the table, naming the table', () => {
    const resolved = resolveDeviceModel('NRF24L01+', ['VDD', 'GND']);
    expect(resolved.ok).toBe(false);
    if (!resolved.ok) {
      expect(resolved.token).toBe('VDD');
      expect(resolved.message).toContain('GND VCC CE CSN SCK MOSI MISO IRQ');
    }
  });

  test('falls back to the pin name table for the one row parts (any number of pins)', () => {
    expect(resolveDeviceModel('HC-SR04', null)).toEqual({ ok: true, model: 'HC-SR04', names: ['VCC', 'TRIG', 'ECHO', 'GND'] });
    expect(resolveDeviceModel('LM75', ['SDA', 'SCL', 'VS', 'GND'])).toMatchObject({ ok: true, names: ['SDA', 'SCL', 'VS', 'GND'] });
  });

  test('refuses an unknown model, listing what can be written', () => {
    const resolved = resolveDeviceModel('XYZ123', null);
    expect(resolved).toMatchObject({ ok: false, token: 'XYZ123' });
    if (!resolved.ok) expect(resolved.message).toContain('EC11');
  });
});
