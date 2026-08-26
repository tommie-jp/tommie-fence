import { describe, expect, test } from 'vitest';
import { NOTE_COLOR_NAMES, NOTE_COLORS, NOTE_INK, NOTE_MARK_COLOR, noteColor, noteWidth, texColorOf } from './notes.ts';

describe('注釈の色', () => {
  test('名前で引ける', () => {
    expect(noteColor('red')).toBe(NOTE_COLORS.red);
  });

  test('知らない名前は引けない', () => {
    expect(noteColor('rainbow')).toBeNull();
  });

  test('色を書かなかった注釈は地の文字色になる', () => {
    expect(noteColor(null)).toBe(NOTE_INK);
  });

  test('使える色を並べられる', () => {
    expect(NOTE_COLOR_NAMES).toContain('red');
    expect(NOTE_COLOR_NAMES).toContain('blue');
  });

  // render/theme.ts は #000 / #fff / gray を目印にして図の色を塗り替える。
  // そこに入る値をパレットに置くと、注釈だけテーマに引きずられて色が変わる。
  test('テーマの塗り替えが目印にしている色とぶつからない', () => {
    for (const value of Object.values(NOTE_COLORS)) {
      expect(['#000000', '#000', '#ffffff', '#fff', 'gray']).not.toContain(value);
    }
  });

  test('字を置く目印の色とぶつからない', () => {
    expect(Object.values(NOTE_COLORS)).not.toContain(NOTE_MARK_COLOR);
  });

  test('TeX に渡す色の名前は表から作る (書き手の字がそのまま入らない)', () => {
    expect(texColorOf('red')).toMatch(/^[A-Za-z]+$/);
  });
});

describe('noteWidth', () => {
  test('空の文字は場所を取らない', () => {
    expect(noteWidth('')).toBe(0);
  });

  test('日本語は ASCII より広く見積もる', () => {
    expect(noteWidth('あい')).toBeGreaterThan(noteWidth('ab'));
  });

  test('字が増えれば広くなる', () => {
    expect(noteWidth('abcd')).toBeGreaterThan(noteWidth('ab'));
  });
});
