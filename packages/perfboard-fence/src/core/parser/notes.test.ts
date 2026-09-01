import { describe, expect, test } from 'vitest';
import { parseNoteLine } from './notes.ts';

describe('parseNoteLine', () => {
  test('reads a mark on one hole', () => {
    expect(parseNoteLine('mark b3')).toEqual({
      ok: true,
      value: { kind: 'mark', from: 'b3', to: null, color: null, text: null },
    });
  });

  test('takes a colour after the holes', () => {
    expect(parseNoteLine('mark b3 red').ok && parseNoteLine('mark b3 red')).toMatchObject({
      value: { color: 'red' },
    });
  });

  test('reads a box and an arrow, which take two holes', () => {
    expect(parseNoteLine('box b3 e7').ok && parseNoteLine('box b3 e7')).toMatchObject({
      value: { kind: 'box', from: 'b3', to: 'e7' },
    });
    expect(parseNoteLine('arrow b3 e7 blue').ok && parseNoteLine('arrow b3 e7 blue')).toMatchObject({
      value: { kind: 'arrow', to: 'e7', color: 'blue' },
    });
  });

  test('reads text, keeping the words as written', () => {
    const result = parseNoteLine('text b3 ここに 注意');

    expect(result.ok && result.value).toMatchObject({ kind: 'text', from: 'b3', text: 'ここに 注意' });
  });

  test('says a box needs two holes', () => {
    expect(parseNoteLine('box b3').ok).toBe(false);
  });

  test('says text needs something to say', () => {
    expect(parseNoteLine('text b3').ok).toBe(false);
  });

  test('names a kind it does not know', () => {
    const result = parseNoteLine('circle b3');

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message).toContain('circle');
  });

  test('refuses a colour it cannot draw', () => {
    expect(parseNoteLine('mark b3 chartreuse').ok).toBe(false);
  });

  test('refuses an extra word after a colour, rather than dropping it', () => {
    expect(parseNoteLine('mark b3 red green').ok).toBe(false);
  });

  test('says so when the line is empty', () => {
    expect(parseNoteLine('   ').ok).toBe(false);
  });
});
