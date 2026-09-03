import { describe, expect, test } from 'vitest';
import { EMPTY_STYLE, mergeStyle, validateStyle } from './style.ts';

const styleOf = (raw: unknown) => validateStyle(raw, 2).value;
const messagesOf = (raw: unknown) => validateStyle(raw, 2).messages;

describe('mergeStyle', () => {
  test('keeps what the earlier style set, so nothing disappears quietly', () => {
    // `style: dark` のあとに `style: {text-size: 20}` と書いてもテーマは残る。
    const merged = mergeStyle(styleOf('dark'), styleOf({ 'text-size': 20 }));

    expect(merged.theme).toBe('dark');
    expect(merged.textSize).toBe(20);
  });

  test('lets the later style win on the keys it writes', () => {
    expect(mergeStyle(styleOf('dark'), styleOf('mono')).theme).toBe('mono');
  });
});

describe('validateStyle', () => {
  test('reads a bare theme name written as a scalar', () => {
    expect(styleOf('dark')).toEqual({ ...EMPTY_STYLE, theme: 'dark', line: 2 });
    expect(messagesOf('dark')).toEqual([]);
  });

  test('reads a theme together with the keys that override it', () => {
    const style = styleOf({ theme: 'dark', 'text-size': 14, 'wire-width': 5 });

    expect(style.theme).toBe('dark');
    expect(style.textSize).toBe(14);
    expect(style.wireWidth).toBe(5);
  });

  test('reads every key the grammar knows', () => {
    const style = styleOf({
      theme: 'mono',
      'text-size': 12,
      'text-color': '#112233',
      'text-background': '#abcdef',
      'wire-width': 4,
      'board-color': '#f0f0f0',
      'hole-size': 6,
      'hole-color': '#010101',
      debug: 'off',
      stamp: 'on',
      check: 'off',
      width: 1200,
    });

    expect(style).toEqual({
      theme: 'mono',
      textSize: 12,
      textColor: '#112233',
      textBackground: '#abcdef',
      wireWidth: 4,
      boardColor: '#f0f0f0',
      holeSize: 6,
      holeColor: '#010101',
      width: 1200,
      debug: false,
      stamp: true,
      check: false,
      line: 2,
    });
  });

  test('reads the switch that turns the checks off', () => {
    // **`debug: off` とは別のもの。** あちらは言うのをやめる、こちらは見るのをやめる。
    expect(styleOf({ check: 'off' }).check).toBe(false);
    expect(styleOf({ check: 'on' }).check).toBe(true);
    expect(styleOf({}).check).toBe(null);
  });

  test('reads the switch that hides the notices', () => {
    expect(styleOf({ debug: 'off' }).debug).toBe(false);
    expect(styleOf({ debug: 'on' }).debug).toBe(true);
    expect(messagesOf({ debug: 'yes' })[0]?.message).toContain('on');
  });

  test('adds how to quote a colour that yaml ate as a comment', () => {
    // `text-color: #333` は `#` から先がコメントになり、値が空で届く。
    // 書いた本人には書いたとおりに見えるので、ここで言わないと直しようがない。
    const message = messagesOf({ 'text-color': null })[0]?.message ?? '';

    expect(message).toContain('"…"');
  });

  test('names the unknown key and keeps the keys it could read', () => {
    const { value, messages } = validateStyle({ 'text-sixe': 14, 'wire-width': 5 }, 2);

    expect(messages).toHaveLength(1);
    expect(messages[0]?.message).toContain('text-sixe');
    expect(value.wireWidth).toBe(5);
  });

  test('clamps a size that is out of range and says so', () => {
    const { value, messages } = validateStyle({ 'hole-size': 100 }, 2);

    expect(value.holeSize).toBe(14);
    expect(messages[0]?.message).toContain('hole-size');
  });

  test('says which key each message is about so the caller can point at its line', () => {
    const { messages } = validateStyle({ 'text-size': 'big', nope: 1 }, 2);

    expect(messages.map((item) => item.key)).toEqual(['text-size', 'nope']);
  });

  test('has no key to point at when the whole of style is unreadable', () => {
    expect(validateStyle(['dark'], 2).messages[0]?.key).toBeNull();
  });

  test('clamps a size that is too small and says so', () => {
    const { value, messages } = validateStyle({ 'text-size': 1 }, 2);

    expect(value.textSize).toBe(6);
    expect(messages).toHaveLength(1);
  });

  test('refuses a colour that is not a plain hex literal', () => {
    for (const bad of ['red', 'rgb(1,2,3)', 'var(--x)', '#12345', 'url(#a)', '#gggggg', '#abc";onload=x']) {
      const { value, messages } = validateStyle({ 'board-color': bad }, 2);

      expect(value.boardColor).toBeNull();
      expect(messages).toHaveLength(1);
    }
  });

  test('accepts the short and the long hex form in either case, and stores one form', () => {
    // 下流 (縁の色を板から作るところ) が 1 つの形だけを相手にできるように揃えておく。
    expect(styleOf({ 'board-color': '#ABC' }).boardColor).toBe('#aabbcc');
    expect(styleOf({ 'hole-color': '#0a0B0c' }).holeColor).toBe('#0a0b0c');
  });

  test('refuses a size that is not a number', () => {
    const { value, messages } = validateStyle({ 'wire-width': 'thick' }, 2);

    expect(value.wireWidth).toBeNull();
    expect(messages).toHaveLength(1);
  });

  test('refuses a theme name that could not be a name at all', () => {
    const { value, messages } = validateStyle({ theme: ['dark'] }, 2);

    expect(value.theme).toBeNull();
    expect(messages).toHaveLength(1);
  });

  test('refuses contents that are neither a name nor a map', () => {
    const { value, messages } = validateStyle(['dark'], 2);

    expect(value).toEqual({ ...EMPTY_STYLE, line: 2 });
    expect(messages).toHaveLength(1);
  });

  test('collects one message per key that could not be read', () => {
    const { messages } = validateStyle({ 'text-size': 'big', 'hole-color': 'blue', nope: 1 }, 2);

    expect(messages).toHaveLength(3);
  });

  test('treats a key inherited from Object.prototype as unknown', () => {
    const { value, messages } = validateStyle({ constructor: 'x', toString: 'y' }, 2);

    expect(value).toEqual({ ...EMPTY_STYLE, line: 2 });
    expect(messages).toHaveLength(2);
  });
});
