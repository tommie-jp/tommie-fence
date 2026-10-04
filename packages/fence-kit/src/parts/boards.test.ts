import { describe, expect, test } from 'vitest';
import { boardPartNames, lookupBoardPart } from './boards.ts';

describe('lookupBoardPart', () => {
  test('knows the four boards of the pico series and the Tang Nano 9K', () => {
    expect(boardPartNames()).toEqual(['pico', 'pico-w', 'pico2', 'pico2-w', 'tang-nano-9k']);
  });

  test('puts the 48 pins of the Tang Nano 9K in DIP order, 9 pitches apart, with the power pins by name', () => {
    const board = lookupBoardPart('tang-nano-9k');
    const pins = board?.pins ?? [];

    expect(board).toMatchObject({ rowSpan: 9, hdmi: true, wireless: false, chip: 'GW1NR-9' });
    expect(pins).toHaveLength(48);
    // 1 番は USB-C 側の左上、24 番は左下の端、25 番は右下の 3V3。
    expect([pins[0], pins[23], pins[24], pins[25], pins[47]]).toEqual(['IO38', 'IO69', '3V3', 'GND', 'IO63']);
    expect(pins.filter((name) => !name.startsWith('IO'))).toEqual(['3V3', 'GND', '5V']);
    expect(new Set(pins).size).toBe(48);
    // 1.8 V の BANK3 は右の列の IO79〜IO86。
    expect(pins).toEqual(expect.arrayContaining(['IO79', 'IO86']));
  });

  test('keeps the pico series at seven pitches', () => {
    expect(lookupBoardPart('pico2')).toMatchObject({ rowSpan: 7, hdmi: false });
  });

  test('names the 40 pins in the order of the official pico pinout', () => {
    const pins = lookupBoardPart('pico')?.pins ?? [];

    expect(pins).toHaveLength(40);
    // 1 番が GP0、40 番が VBUS。この 2 本が USB 側の端で隣り合う。
    expect(pins[0]).toBe('GP0');
    expect(pins[39]).toBe('VBUS');
    expect(pins[19]).toBe('GP15');
    expect(pins[20]).toBe('GP16');
    expect(pins[35]).toBe('3V3');
    expect(pins[32]).toBe('AGND');
  });

  test('numbers the repeated grounds so every pin can be referenced by name', () => {
    const pins = lookupBoardPart('pico')?.pins ?? [];

    expect(new Set(pins).size).toBe(40);
    expect(pins[2]).toBe('GND3');
    expect(pins[37]).toBe('GND38');
  });

  test('shares one header across the series and keeps the chip and radio apart', () => {
    expect(lookupBoardPart('pico2')?.pins).toEqual(lookupBoardPart('pico')?.pins);
    expect(lookupBoardPart('pico')?.chip).toBe('RP2040');
    expect(lookupBoardPart('pico2')?.chip).toBe('RP2350');
    expect(lookupBoardPart('pico2-w')?.wireless).toBe(true);
    expect(lookupBoardPart('pico2')?.wireless).toBe(false);
    expect(lookupBoardPart('pico-w')?.name).toBe('Pico W');
  });

  test('returns null for a name it does not know', () => {
    expect(lookupBoardPart('pico3')).toBeNull();
    // 素の添字だと Object.prototype から拾えてしまう名前。
    expect(lookupBoardPart('constructor')).toBeNull();
    expect(lookupBoardPart('toString')).toBeNull();
  });
});
