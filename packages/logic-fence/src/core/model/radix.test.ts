import { describe, expect, test } from 'vitest';
import { formatBusValue } from './radix.ts';

describe('formatBusValue', () => {
  test('writes hex with 0x, upper case, padded to the bus width', () => {
    expect(formatBusValue(3, 4, 'hex')).toBe('0x3');
    expect(formatBusValue(10, 8, 'hex')).toBe('0x0A');
    expect(formatBusValue(0x1ff, 12, 'hex')).toBe('0x1FF');
  });

  test('writes bin padded to the width', () => {
    expect(formatBusValue(5, 4, 'bin')).toBe('0b0101');
  });

  test('writes dec unsigned and sint as two-complement', () => {
    expect(formatBusValue(14, 4, 'dec')).toBe('14');
    expect(formatBusValue(14, 4, 'sint')).toBe('-2');
    expect(formatBusValue(7, 4, 'sint')).toBe('7');
    expect(formatBusValue(8, 4, 'sint')).toBe('-8');
    expect(formatBusValue(0, 1, 'sint')).toBe('0');
    expect(formatBusValue(1, 1, 'sint')).toBe('-1');
  });
});
