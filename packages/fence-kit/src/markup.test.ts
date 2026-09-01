import { describe, expect, test } from 'vitest';
import { element, escapeMarkup } from './markup.ts';

/** 符号位置から 1 文字。制御文字をソースに直接書かないため。 */
const ch = (code: number): string => String.fromCharCode(code);

describe('escapeMarkup', () => {
  test('escapes the five characters that carry meaning in markup', () => {
    expect(escapeMarkup(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&apos;');
  });

  test('escapes the ampersand first so entities are not doubled', () => {
    expect(escapeMarkup('&lt;')).toBe('&amp;lt;');
  });

  test('leaves ordinary text alone, Japanese included', () => {
    expect(escapeMarkup('抵抗 R1 10kΩ')).toBe('抵抗 R1 10kΩ');
  });

  /**
   * **落とす範囲は勝手に変えない。** ここは XML 1.0 が載せられない字の範囲で、
   * `escapeXml` / `escapeHtml` として 2 か所に複製されていたものを引き上げた。
   * 1 文字でも通すと図全体がパースできなくなる。
   */
  describe('制御文字', () => {
    const kept = [0x09, 0x0a, 0x0d];
    const dropped = [
      ...[0x00, 0x01, 0x08, 0x0b, 0x0c, 0x0e, 0x1f],
      ...[0x7f, 0x80, 0x9f],
    ];

    test.each(kept)('keeps U+%s (tab, newline, carriage return)', (code) => {
      expect(escapeMarkup(`a${ch(code)}b`)).toBe(`a${ch(code)}b`);
    });

    test.each(dropped)('drops U+%s', (code) => {
      expect(escapeMarkup(`a${ch(code)}b`)).toBe('ab');
    });

    test('keeps every printable character from U+0020 to U+007E', () => {
      const printable = Array.from({ length: 0x7f - 0x20 }, (_, i) => ch(0x20 + i)).join('');

      expect(escapeMarkup(printable).length).toBe(printable.length + '&amp;&lt;&gt;&quot;&apos;'.length - 5);
    });

    test('keeps U+00A0 and above', () => {
      expect(escapeMarkup(`a${ch(0xa0)}b`)).toBe(`a${ch(0xa0)}b`);
    });
  });
});

describe('element', () => {
  test('writes an element with its children', () => {
    expect(element('text', { x: 1 }, 'hi')).toBe('<text x="1">hi</text>');
  });

  test('closes an element that has no children', () => {
    expect(element('circle', { r: 2 })).toBe('<circle r="2"/>');
  });

  test('drops attributes that are undefined', () => {
    expect(element('rect', { x: 1, fill: undefined }, '')).toBe('<rect x="1"></rect>');
  });

  // 値は入れる側が組み立てた文字列なので、属性はここで必ず通す。
  test('escapes attribute values', () => {
    expect(element('text', { title: '<script>' }, '')).toBe('<text title="&lt;script&gt;"></text>');
  });

  test('treats children as markup that is already assembled', () => {
    expect(element('g', {}, '<circle r="1"/>')).toBe('<g><circle r="1"/></g>');
  });
});
