import { describe, expect, test } from 'vitest';
import { parseFence } from './parseFence.ts';

describe('parseFence', () => {
  test('says the fence is empty instead of drawing nothing in silence', () => {
    const parsed = parseFence('   \n\n');

    expect(parsed.doc).toBeNull();
    expect(parsed.errors[0]?.message).toContain('空');
  });

  test('reports a yaml syntax error with the line it is on', () => {
    const parsed = parseFence('board: 28x18\n\tparts: 1\n');

    expect(parsed.doc).toBeNull();
    expect(parsed.errors[0]?.message).toContain('YAML の構文エラー');
    expect(parsed.errors[0]?.line).toBe(2);
  });

  test('reports the line yaml gave up on, even when the cause is further back', () => {
    // 閉じない `[` は入力の終わりまで読んでから分かるので、yaml は最終行を指す。
    // **その位置を動かさない** — 文面の中の「at line 3」と食い違わせないため。
    const parsed = parseFence('parts:\n  R1: [unclosed\n');

    expect(parsed.errors[0]?.line).toBe(3);
  });

  test('rejects a fence whose top level is not a mapping', () => {
    const parsed = parseFence('- board: 28x18\n');

    expect(parsed.doc).toBeNull();
    expect(parsed.errors[0]?.message).toContain('キーと値');
  });

  test('names a key it does not know, with the line it is on', () => {
    const parsed = parseFence('board: 28x18\nbored: x\n');

    expect(parsed.errors.some((e) => e.message.includes('bored') && e.line === 2)).toBe(true);
  });

  test('asks for board: when it is missing', () => {
    const parsed = parseFence('parts: {}\n');

    expect(parsed.errors.some((e) => e.message.includes('board'))).toBe(true);
  });

  test('keeps the document when the fence is well formed', () => {
    const parsed = parseFence('board: 28x18\n');

    expect(parsed.doc?.board).toEqual({ cols: 28, rows: 18 });
    expect(parsed.errors).toEqual([]);
  });
  test('says once that board: has no value, not twice that it is missing', () => {
    const parsed = parseFence('board:\n');

    expect(parsed.errors).toHaveLength(1);
    expect(parsed.errors[0]?.message).toContain('列x行');
  });

  test('names a size it cannot read, and shows how to write one', () => {
    const parsed = parseFence('board: akizuki-c\n');

    expect(parsed.doc).toBeNull();
    expect(parsed.errors[0]?.message).toContain('akizuki-c');
    expect(parsed.errors[0]?.message).toContain('28x18');
  });

  test('names the size as it was written, not as yaml resolved it', () => {
    // `0x18` は YAML が 16 進の 24 として読む。解決後の値を名指すと、
    // **行のどこにも無い綴り**を指すことになり、印も付かなくなる。
    const parsed = parseFence('board: 0x18\n');

    expect(parsed.errors[0]?.message).toContain('0x18');
    expect(parsed.errors[0]?.message).not.toContain('24 は');
    expect(parsed.errors[0]?.token).toBe('0x18');
  });

  test('underlines the whole of what was written', () => {
    const parsed = parseFence('board: 1.10\n');

    expect(parsed.errors[0]?.token).toBe('1.10');
  });

  test('refuses a board too big to be a real one', () => {
    const parsed = parseFence('board: 1000x1000\n');

    expect(parsed.doc).toBeNull();
    expect(parsed.errors[0]?.message).toContain('列x行');
  });

  test('reports a second board: instead of letting the last one win in silence', () => {
    const parsed = parseFence('board: 28x18\nboard: 24x16\n');

    expect(parsed.errors.some((e) => e.message.includes('2 つ') && e.line === 2)).toBe(true);
  });

  test('points at where the content starts, not at line 1', () => {
    // 先頭が注釈のときに 1 行目を指すと、何も書いていない行を名指すことになる。
    const parsed = parseFence('# メモ\n# つづき\nparts: {}\n');

    expect(parsed.errors.some((e) => e.message.includes('board') && e.line === 3)).toBe(true);
  });

  test('points at where the sequence starts when the top level is not a mapping', () => {
    const parsed = parseFence('# メモ\n- board: 28x18\n');

    expect(parsed.errors[0]?.line).toBe(2);
  });
});
