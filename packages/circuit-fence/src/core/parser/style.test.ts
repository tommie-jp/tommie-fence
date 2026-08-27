import { describe, expect, test } from 'vitest';
import { STYLE_RANGES } from '../limits.ts';
import { EMPTY_STYLE, validateStyle } from './style.ts';

const read = (raw: unknown) => validateStyle(raw);
const valueOf = (raw: unknown) => read(raw).value;
const messagesOf = (raw: unknown) => read(raw).messages;

describe('validateStyle', () => {
  test('reads the short form, where only the theme is chosen', () => {
    expect(valueOf('dark')).toMatchObject({ theme: 'dark' });
  });

  test('reads nothing as everything left at its default', () => {
    expect(valueOf({})).toEqual(EMPTY_STYLE);
  });

  test('reads the grid switch', () => {
    expect(valueOf({ grid: true })).toMatchObject({ grid: true });
    expect(valueOf({ grid: false })).toMatchObject({ grid: false });
  });

  test('reads how far the grid should reach', () => {
    expect(valueOf({ 'grid-to': 'e12' })).toMatchObject({ gridTo: { row: 4, col: 11 } });
  });

  test('names the grid-to it could not read as an address', () => {
    const messages = messagesOf({ 'grid-to': 'zz' });

    expect(messages[0]?.key).toBe('grid-to');
    expect(messages[0]?.message).toContain('番地');
  });

  test('reads the sizes', () => {
    expect(valueOf({ pitch: 1.5, 'wire-width': 1.2, width: 480 })).toMatchObject({
      pitch: 1.5,
      wireWidth: 1.2,
      width: 480,
    });
  });

  test('pulls a size that is out of range back to the edge and says so', () => {
    const { value, messages } = read({ pitch: 99 });

    expect(value.pitch).toBe(STYLE_RANGES.pitch.max);
    expect(messages[0]?.message).toContain(`${STYLE_RANGES.pitch.max}`);
  });

  test('refuses a size that is not a number', () => {
    expect(messagesOf({ width: 'wide' })[0]?.key).toBe('width');
    expect(valueOf({ width: 'wide' }).width).toBeNull();
  });

  test('reads the symbol standard', () => {
    expect(valueOf({ standard: 'european' })).toMatchObject({ standard: 'european' });
  });

  test('refuses a standard it does not know', () => {
    expect(messagesOf({ standard: 'japanese' })[0]?.message).toContain('american');
  });

  test('reads colours written as hex and normalises them', () => {
    expect(valueOf({ 'ink-color': '#F00' })).toMatchObject({ inkColor: '#ff0000' });
    expect(valueOf({ 'paper-color': '#0d1117' })).toMatchObject({ paperColor: '#0d1117' });
  });

  test('refuses a colour written as a name, which could be any text', () => {
    expect(messagesOf({ 'ink-color': 'red' })[0]?.message).toContain('#');
    expect(valueOf({ 'ink-color': 'red' }).inkColor).toBeNull();
  });

  test('says to quote a colour that YAML read as a comment', () => {
    // `ink-color: #333` は `#` から先がコメントになり、値が空で届く。
    // 「#rgb で書きます」とだけ返すと、そう書いた人には堂々巡りになる。
    const message = messagesOf({ 'ink-color': null })[0]?.message ?? '';

    expect(message).toContain('"');
  });

  test('names the item it does not know and lists the ones it does', () => {
    const messages = messagesOf({ 'hole-size': 4 });

    expect(messages[0]?.key).toBe('hole-size');
    expect(messages[0]?.message).toContain('theme');
  });

  test('keeps the items it could read when one of them is broken', () => {
    const { value, messages } = read({ theme: 'dark', width: 'wide' });

    expect(value.theme).toBe('dark');
    expect(messages).toHaveLength(1);
  });

  test('asks for a theme name or a map when given something else', () => {
    expect(messagesOf(['dark'])[0]?.key).toBeNull();
  });
});
