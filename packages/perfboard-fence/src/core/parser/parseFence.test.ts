import { describe, expect, test } from 'vitest';
import { parseFence } from './parseFence.ts';

describe('parseFence', () => {
  test('says the fence is empty instead of drawing nothing in silence', () => {
    const parsed = parseFence('   \n\n');

    expect(parsed.doc).toBeNull();
    expect(parsed.errors[0]?.message).toContain('空');
  });

  test('reports a yaml syntax error with the line it is on', () => {
    const parsed = parseFence('board: akizuki-c\n\tparts: 1\n');

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
    const parsed = parseFence('- board: akizuki-c\n');

    expect(parsed.doc).toBeNull();
    expect(parsed.errors[0]?.message).toContain('キーと値');
  });

  test('names a key it does not know, with the line it is on', () => {
    const parsed = parseFence('board: akizuki-c\nbored: x\n');

    expect(parsed.errors.some((e) => e.message.includes('bored') && e.line === 2)).toBe(true);
  });

  test('asks for board: when it is missing', () => {
    const parsed = parseFence('parts: {}\n');

    expect(parsed.errors.some((e) => e.message.includes('board'))).toBe(true);
  });

  test('keeps the document when the fence is well formed', () => {
    const parsed = parseFence('board: akizuki-c\n');

    expect(parsed.doc?.board).toBe('akizuki-c');
    expect(parsed.errors).toEqual([]);
  });
  test('says once that board: has no value, not twice that it is missing', () => {
    const parsed = parseFence('board:\n');

    expect(parsed.errors).toHaveLength(1);
    expect(parsed.errors[0]?.message).toContain('板の名前');
  });

  test('reports a second board: instead of letting the last one win in silence', () => {
    const parsed = parseFence('board: akizuki-b\nboard: akizuki-c\n');

    expect(parsed.errors.some((e) => e.message.includes('2 つ') && e.line === 2)).toBe(true);
  });

  test('points at where the content starts, not at line 1', () => {
    // 先頭が注釈のときに 1 行目を指すと、何も書いていない行を名指すことになる。
    const parsed = parseFence('# メモ\n# つづき\nparts: {}\n');

    expect(parsed.errors.some((e) => e.message.includes('board') && e.line === 3)).toBe(true);
  });

  test('points at where the sequence starts when the top level is not a mapping', () => {
    const parsed = parseFence('# メモ\n- board: akizuki-c\n');

    expect(parsed.errors[0]?.line).toBe(2);
  });
});
