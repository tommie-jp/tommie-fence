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

  // グリッドの行英字と列数字は、図の上で読んで数えるもの。図に合わせて
  // 大きさと色を選べる。語は注釈と同じ並びを使う (覚えることを増やさない)。
  test('reads the size and colour written after the grid switch', () => {
    expect(valueOf({ grid: 'on large red' })).toMatchObject({
      grid: true,
      gridLabelSize: 'large',
      gridLabelColor: 'red',
    });
  });

  test('reads those words in any order', () => {
    expect(valueOf({ grid: 'on red large' })).toMatchObject({ gridLabelSize: 'large', gridLabelColor: 'red' });
  });

  test('leaves the size and colour unset when only the switch is written', () => {
    expect(valueOf({ grid: 'on' })).toMatchObject({ grid: true, gridLabelSize: null, gridLabelColor: null });
  });

  test('names the word it does not know and lists the ones it does', () => {
    const messages = messagesOf({ grid: 'on enormous' });

    expect(messages[0]?.key).toBe('grid');
    expect(messages[0]?.message).toContain('enormous');
    expect(messages[0]?.message).toContain('large');
    expect(messages[0]?.message).toContain('red');
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

  test('reads the version stamp switch', () => {
    expect(valueOf({ stamp: true })).toMatchObject({ stamp: true });
    expect(valueOf({ stamp: 'on' })).toMatchObject({ stamp: true });
    expect(valueOf({ stamp: 'off' })).toMatchObject({ stamp: false });
  });

  test('leaves the stamp unwritten when nothing says otherwise', () => {
    expect(valueOf({}).stamp).toBeNull();
  });

  test('asks for on or off when the stamp is written as something else', () => {
    const messages = messagesOf({ stamp: 'yes' });

    expect(messages[0]?.key).toBe('stamp');
    expect(messages[0]?.message).toContain('on');
  });

  // お知らせ (図は描けたが思ったとおりには出ない、の類) を出すかどうか。
  // 既定は on — 黙らせるほうを書き手に選ばせる。
  test('reads the notice switch', () => {
    expect(valueOf({ debug: true })).toMatchObject({ debug: true });
    expect(valueOf({ debug: 'on' })).toMatchObject({ debug: true });
    expect(valueOf({ debug: 'off' })).toMatchObject({ debug: false });
  });

  test('leaves the notice switch unwritten when nothing says otherwise', () => {
    expect(valueOf({}).debug).toBeNull();
  });

  test('asks for on or off when the notice switch is written as something else', () => {
    const messages = messagesOf({ debug: 'quiet' });

    expect(messages[0]?.key).toBe('debug');
    expect(messages[0]?.message).toContain('on');
  });
});

// 読めなかった値の綴り。行の中でどこを指すかを決めるのに使う (errors.ts が桁に畳む)。
describe('validateStyle が返す綴り', () => {
  test('hands back the value, which is the half the reader has to fix', () => {
    const messages = messagesOf({ theme: 'darkk' });

    expect(messages[0]?.token).toBe('darkk');
  });

  test('hands back the item name when nothing was written there at all', () => {
    const messages = messagesOf({ nosuch: 1 });

    expect(messages[0]?.token).toBe('nosuch');
  });

  test('hands back nothing for a value written as a number, which need not match the line', () => {
    // `pitch: 1.50` を String(1.5) で探すと見つからない。指せないほうを選ぶ。
    const messages = messagesOf({ pitch: 99 });

    expect(messages[0]?.token).toBeUndefined();
  });

  test('hands back the word it did not know among the grid words', () => {
    const messages = messagesOf({ grid: 'on nosuch' });

    expect(messages[0]?.token).toBe('nosuch');
  });
});
