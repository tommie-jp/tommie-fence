import { describe, expect, test } from 'vitest';
import { attachSourceText, fenceError, locate, notice, safeToken, snippetOf } from './errors.ts';
import { LIMITS } from './limits.ts';

describe('safeToken', () => {
  test('keeps the characters an identifier is made of', () => {
    expect(safeToken('resistr')).toBe('resistr');
    expect(safeToken('capacitor/mica')).toBe('capacitor/mica');
  });

  test('drops what could break out of the drawing, and cuts what is long', () => {
    expect(safeToken('</svg><script>')).toBe('/svg script');
    expect(safeToken('x'.repeat(40)).endsWith('…')).toBe(true);
  });
});

describe('snippetOf', () => {
  test('leaves an ordinary line alone, indent included', () => {
    expect(snippetOf('  R1: resistor a5 a10')).toBe('  R1: resistor a5 a10');
  });

  test('replaces an invisible character with exactly one character', () => {
    // 1 文字を 1 文字に。詰めても伸ばしても、下に付ける印の桁が本文とずれる。
    const shown = snippetOf('a​bc');

    expect(shown).toBe('a·b·c');
    expect(shown.length).toBe(5);
  });

  test('replaces a bidi control, which can otherwise reorder what is shown', () => {
    expect(snippetOf('a‮b')).toBe('a·b');
  });

  test('cuts a line that is longer than the limit', () => {
    const shown = snippetOf('x'.repeat(LIMITS.snippetLength + 40));

    expect(shown.endsWith('…')).toBe(true);
    expect([...shown].length).toBe(LIMITS.snippetLength + 1);
  });
});

describe('locate', () => {
  test('finds the one place the spelling appears', () => {
    expect(locate('  R1: resistr a5', 'resistr')).toEqual({ column: 6, length: 7 });
  });

  test('points at nothing when the spelling appears twice', () => {
    // どちらでもない場所を指すより、指さないほうがまだ正しい。
    expect(locate('  resistr: resistr a5', 'resistr')).toBeNull();
  });

  test('counts the column in code points, so a surrogate pair does not shift it', () => {
    expect(locate('  🙂: resistr', 'resistr')).toEqual({ column: 5, length: 7 });
  });

  test('gives up when the spelling sits past the part of the line that is shown', () => {
    expect(locate(`${'x'.repeat(LIMITS.snippetLength)} resistr`, 'resistr')).toBeNull();
  });
});

describe('attachSourceText', () => {
  const source = ['parts:', '  R1: resistr a5 a10', ''].join('\n');

  test('adds the line the error is on', () => {
    const [error] = attachSourceText([fenceError('知らない部品', 2, 'resistr')], source);

    expect(error?.text).toBe('  R1: resistr a5 a10');
    expect(error?.at).toEqual({ column: 6, length: 7 });
  });

  test('adds the line without a mark when no spelling was given', () => {
    const [error] = attachSourceText([fenceError('何か', 2)], source);

    expect(error?.text).toBe('  R1: resistr a5 a10');
    expect(error?.at).toBeUndefined();
  });

  test('adds nothing for an error that has no line, or whose line is blank', () => {
    const [none, blank] = attachSourceText([fenceError('全体', null), fenceError('空行', 3)], source);

    expect(none?.text).toBeUndefined();
    expect(blank?.text).toBeUndefined();
  });

  test('keeps the notice flag, since only notices can be hidden', () => {
    const [item] = attachSourceText([notice('お知らせ', 2)], source);

    expect(item?.notice).toBe(true);
  });
});
