import { describe, expect, test } from 'vitest';
import { boardPartNames, lookupBoardPart } from './boards.ts';

describe('lookupBoardPart', () => {
  test('knows the four boards of the pico series', () => {
    expect(boardPartNames()).toEqual(['pico', 'pico-w', 'pico2', 'pico2-w']);
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
