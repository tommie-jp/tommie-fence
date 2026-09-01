import { describe, expect, test } from 'vitest';
import { parseWireLine } from './wires.ts';

describe('parseWireLine', () => {
  test('reads the two ends of a wire', () => {
    expect(parseWireLine('b7 -- c5')).toEqual({
      ok: true,
      value: { from: 'b7', to: 'c5', color: null },
    });
  });

  test('takes a colour after the ends', () => {
    expect(parseWireLine('b7 -- c5 red').ok && parseWireLine('b7 -- c5 red')).toMatchObject({
      value: { color: 'red' },
    });
  });

  test('does not mind how much space is around the dashes', () => {
    expect(parseWireLine('b7--c5').ok).toBe(true);
    expect(parseWireLine('  b7   --   c5  ').ok).toBe(true);
  });

  test('takes a name in place of an address, because points: can name a hole', () => {
    // 名前が番地かどうかは、points: を全部読んでからでないと決まらない。
    expect(parseWireLine('VCC -- b7').ok).toBe(true);
  });

  test('says a wire needs two ends', () => {
    expect(parseWireLine('b7').ok).toBe(false);
    expect(parseWireLine('b7 --').ok).toBe(false);
    expect(parseWireLine('-- c5').ok).toBe(false);
  });

  test('refuses a colour it cannot draw, instead of letting it into the attribute', () => {
    const result = parseWireLine('b7 -- c5 chartreuse');

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message).toContain('chartreuse');
    expect(!result.ok && result.error.token).toBe('chartreuse');
  });

  test('refuses more than three tokens, rather than dropping the extra in silence', () => {
    expect(parseWireLine('b7 -- c5 red blue').ok).toBe(false);
  });
});
