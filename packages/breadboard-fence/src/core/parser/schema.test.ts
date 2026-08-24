import { describe, expect, test } from 'vitest';
import { LIMITS } from '../limits.ts';
import { validateExpandedPart } from './schema.ts';

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
    expect(validateExpandedPart({ type: 'device', pins: [1, 2] }).ok).toBe(false);
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

  test('reports a device with more pins than any real package has', () => {
    const pins = Array.from({ length: LIMITS.devicePins + 1 }, (_, index) => `P${index}`);

    expect(validateExpandedPart({ type: 'device', pins }).ok).toBe(false);
  });

  test('cuts a label that is long enough to blow up the drawing', () => {
    const result = validateExpandedPart({ type: 'device', label: 'あ'.repeat(500), pins: ['P1'] });

    expect(result.ok && result.value.label?.length).toBeLessThanOrEqual(LIMITS.labelLength + 1);
  });
});
