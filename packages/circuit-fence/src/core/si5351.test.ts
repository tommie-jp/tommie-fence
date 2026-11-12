import { describe, expect, test } from 'vitest';
import { parseFence } from './parser/parseFence.ts';

/**
 * Si5351A のクロック発生器のモジュール 2 種。**機器 (`device`) の `model:` でピンの名前を表から引く**。
 * 1 列 7 本の Adafruit 2045 (と紫の互換基板) と、DIP8 形の秋月 AE-Si5351A-B は並びも電源も違う。
 */
const device = (model: string, ...more: string[]): string =>
  ['parts:', '  M1:', '    type: device', '    at: 5,4', `    model: ${model}`, ...more, ''].join('\n');

describe('Si5351A のモジュール', () => {
  test.each([
    ['ADAFRUIT-2045'], ['SI5351A-BREAKOUT'], ['CJMCU-5351'],
  ])('gives %s the seven pins of the breakout, clocks first', (model) => {
    const { doc, errors } = parseFence(device(model));

    expect(errors).toEqual([]);
    expect(doc.parts[0]).toMatchObject({ pinNames: ['CLK0', 'CLK1', 'CLK2', 'SCL', 'SDA', 'GND', 'VIN'] });
  });

  test('gives the Akizuki module its own eight pins, with the two supplies', () => {
    const { doc, errors } = parseFence(device('AE-Si5351A-B'));

    expect(errors).toEqual([]);
    expect(doc.parts[0]).toMatchObject({ pinNames: ['VDDO', 'SCL', 'SDA', 'GND', 'CLK0', 'CLK1', 'CLK2', 'VDD'] });
  });

  test('draws only the pins that are written, and refuses a pin of the other module', () => {
    const used = parseFence(device('ADAFRUIT-2045', '    pins: [VIN, GND, SDA, SCL, CLK0]'));
    expect(used.errors).toEqual([]);
    expect(used.doc.parts[0]).toMatchObject({ pinNames: ['VIN', 'GND', 'SDA', 'SCL', 'CLK0'] });

    const wrong = parseFence(device('ADAFRUIT-2045', '    pins: [VDD, GND]'));
    expect(wrong.errors[0]?.message).toContain('ADAFRUIT-2045 に VDD というピンはありません');
  });
});
