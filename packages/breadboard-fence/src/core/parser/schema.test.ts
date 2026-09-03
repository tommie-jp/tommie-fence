import { describe, expect, test } from 'vitest';
import { LIMITS } from '../limits.ts';
import { validateExpandedPart } from './schema.ts';
import { NO_TURN } from '../parts/orient.ts';

describe('validateExpandedPart', () => {
  test('accepts the fields an off board device needs', () => {
    const result = validateExpandedPart({
      type: 'device',
      at: 'top',
      label: 'Analog Discovery 2',
      pins: ['W1', 'GND'],
    });

    expect(result.ok).toBe(true);
    expect(result.ok && result.value).toEqual({
      type: 'device',
      at: 'top',
      label: 'Analog Discovery 2',
      value: null,
      pins: ['W1', 'GND'],
      turn: NO_TURN,
      holes: [],
    });
  });

  test('requires the type of the part', () => {
    expect(validateExpandedPart({ at: 'top' }).ok).toBe(false);
  });

  test('reads a number written as a label or a value', () => {
    const result = validateExpandedPart({ type: 'resistor', value: 330, label: 7 });

    expect(result.ok && result.value.value).toBe('330');
    expect(result.ok && result.value.label).toBe('7');
  });

  test('reports a placement that is neither top nor bottom', () => {
    const result = validateExpandedPart({ type: 'device', at: 'middle' });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.message).toContain('at');
  });

  test('reports pins that are not a list of names', () => {
    expect(validateExpandedPart({ type: 'device', pins: 'W1' }).ok).toBe(false);
    expect(validateExpandedPart({ type: 'device', pins: [true] }).ok).toBe(false);
    expect(validateExpandedPart({ type: 'device', pins: [{ name: 'W1' }] }).ok).toBe(false);
  });

  test('reports holes that are not a list of addresses', () => {
    expect(validateExpandedPart({ type: 'resistor', holes: { a: 'a5' } }).ok).toBe(false);
  });

  test('reports a key that the grammar does not know', () => {
    const result = validateExpandedPart({ type: 'resistor', colour: 'red' });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.message).toContain('colour');
  });

  test('reports a part that is not a map at all', () => {
    expect(validateExpandedPart(null).ok).toBe(false);
    expect(validateExpandedPart(['resistor']).ok).toBe(false);
  });

  test('reports a pin name that a wire could never refer to', () => {
    expect(validateExpandedPart({ type: 'device', pins: ['W 1'] }).ok).toBe(false);
    expect(validateExpandedPart({ type: 'device', pins: [''] }).ok).toBe(false);
    expect(validateExpandedPart({ type: 'device', pins: ['x'.repeat(LIMITS.pinNameLength + 1)] }).ok).toBe(false);
  });

  test('reports a device that repeats a pin name', () => {
    const result = validateExpandedPart({ type: 'device', pins: ['W1', 'GND', 'GND'] });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.message).toContain('GND');
  });

  test('reads pin names written as numbers', () => {
    const result = validateExpandedPart({ type: 'device', pins: [1, 2] });

    expect(result.ok && result.value.pins).toEqual(['1', '2']);
  });

  test('reports a device with more pins than any real package has', () => {
    const pins = Array.from({ length: LIMITS.devicePins + 1 }, (_, index) => `P${index}`);

    expect(validateExpandedPart({ type: 'device', pins }).ok).toBe(false);
  });

  test('reports a value on a device, which the drawing has nowhere to put', () => {
    const result = validateExpandedPart({ type: 'device', label: '電池', value: '3V', pins: ['+', '-'] });

    // 描けるところ (ラベルとピン) は捨てずに、使われない value だけを言う。
    expect(result.ok).toBe(true);
    expect(result.ok && result.value.label).toBe('電池');
    expect(result.ok && result.value.value).toBeNull();
    expect(result.ok && result.notes.join('')).toContain('value');
  });

  test('reports a placement on a part that goes on the board, not off it', () => {
    const result = validateExpandedPart({ type: 'resistor', at: 'top', holes: ['a5', 'a10'] });

    // 挿す場所は holes で決まる。at は帯 (機器) にしか効かないので落として言う。
    expect(result.ok).toBe(true);
    expect(result.ok && result.value.holes).toEqual(['a5', 'a10']);
    expect(result.ok && result.value.at).toBeNull();
    expect(result.ok && result.notes.join('')).toContain('at');
  });

  test('says nothing about at when the part is an off board device', () => {
    const result = validateExpandedPart({ type: 'device', at: 'bottom', pins: ['1'] });

    expect(result.ok && result.value.at).toBe('bottom');
    expect(result.ok && result.notes).toEqual([]);
  });

  test('says nothing about value when the part is not a device', () => {
    const result = validateExpandedPart({ type: 'resistor', value: '330', holes: ['a5', 'a10'] });

    expect(result.ok && result.value.value).toBe('330');
    expect(result.ok && result.notes).toEqual([]);
  });

  test('cuts a label that is long enough to blow up the drawing', () => {
    const result = validateExpandedPart({ type: 'device', label: 'あ'.repeat(500), pins: ['P1'] });

    expect(result.ok && result.value.label?.length).toBeLessThanOrEqual(LIMITS.labelLength + 1);
  });
});

describe('マップ形式の turn', () => {
  test('reads the same word the one line form writes', () => {
    const result = validateExpandedPart({ type: 'dip8', holes: ['e5'], turn: 'r180' });

    expect(result.ok && result.value.turn).toEqual({ rotate: 180, mirror: false });
  });

  test('refuses the same words for the same reasons, so the two forms agree', () => {
    // 書ける向きの決まりは `parts/orient.ts` の 1 か所。形ごとに食い違わない。
    const result = validateExpandedPart({ type: 'dip8', holes: ['e5'], turn: 'r90' });

    expect(!result.ok && result.message).toContain('溝をまたぐ');
  });
});
