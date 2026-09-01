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

  test('names a board it cannot read, and shows how to write one', () => {
    const parsed = parseFence('board: elegoo-5x7\n');

    expect(parsed.doc).toBeNull();
    expect(parsed.errors[0]?.message).toContain('elegoo-5x7');
    expect(parsed.errors[0]?.message).toContain('akizuki-c');
  });

  test('reads a board written by name', () => {
    const parsed = parseFence('board: akizuki-c\n');

    expect(parsed.errors).toEqual([]);
    expect(parsed.doc?.board).toEqual({ cols: 25, rows: 15 });
  });

  test('reads a board written as the size it is sold at', () => {
    // 秋月は同じ C タイプを 72×47mm と 72×47.5mm の両方で書いている。
    for (const spelling of ['72x47mm', '72x47.5mm', '7.2x4.7cm', 'c']) {
      const parsed = parseFence(`board: ${spelling}\n`);

      expect(parsed.errors).toEqual([]);
      expect(parsed.doc?.board).toEqual({ cols: 25, rows: 15 });
    }
  });

  test('offers the nearest board when a rounded size is not one it has', () => {
    // 7×5cm は汎用基板の呼び名。**丸めて秋月 C に当てない** — 別の板で穴数も違う。
    const parsed = parseFence('board: 7x5cm\n');

    expect(parsed.doc).toBeNull();
    expect(parsed.errors[0]?.message).toContain('akizuki-c');
    expect(parsed.errors[0]?.token).toBe('7x5cm');
  });

  test('draws a bare size as holes but says so when it is also a board size', () => {
    // `72x47` は 72 列 × 47 行 (3,384 穴) として黙って通る。図は出るので
    // エラーではなくお知らせだが、言わないと**別物の図に気づけない**。
    const parsed = parseFence('board: 72x47\n');

    expect(parsed.doc?.board).toEqual({ cols: 72, rows: 47 });
    expect(parsed.errors).toHaveLength(1);
    expect(parsed.errors[0]?.notice).toBe(true);
    expect(parsed.errors[0]?.message).toContain('akizuki-c');
    expect(parsed.errors[0]?.line).toBe(1);
  });

  test('says nothing extra about a hole count that is no board size', () => {
    expect(parseFence('board: 25x15\n').errors).toEqual([]);
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

  test('says a board is too big rather than that it could not be read', () => {
    // 直す手が違う。`offBoardReason` が行と列を言い分けるのと同じ理由。
    const parsed = parseFence('board: 1000x1000\n');

    expect(parsed.doc).toBeNull();
    expect(parsed.errors[0]?.message).toContain('大きすぎ');
    expect(parsed.errors[0]?.message).toContain('120x120');
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
  test('reads parts, with the line each one is on', () => {
    const parsed = parseFence('board: 10x6\nparts:\n  R1: resistor b3 b7 10k\n  D1: led c5 c7\n');

    expect(parsed.errors).toEqual([]);
    expect(parsed.doc?.parts).toHaveLength(2);
    expect(parsed.doc?.parts[0]).toMatchObject({ id: 'R1', type: 'resistor', value: '10k', line: 3 });
    expect(parsed.doc?.parts[1]).toMatchObject({ id: 'D1', type: 'led', line: 4 });
  });

  test('keeps the parts it could read when one line is wrong', () => {
    const parsed = parseFence('board: 10x6\nparts:\n  R1: resistr b3 b7\n  D1: led c5 c7\n');

    expect(parsed.doc?.parts.map((part) => part.id)).toEqual(['D1']);
    expect(parsed.errors[0]?.line).toBe(3);
    expect(parsed.errors[0]?.token).toBe('resistr');
  });

  test('says parts: must be a mapping of name to part', () => {
    const parsed = parseFence('board: 10x6\nparts:\n  - resistor b3 b7\n');

    expect(parsed.errors[0]?.message).toContain('名前');
  });

  test('takes a fence with no parts at all', () => {
    expect(parseFence('board: 10x6\n').doc?.parts).toEqual([]);
  });
  test('reports a second parts: instead of merging the two in silence', () => {
    // board: は 2 つあると言うのに parts: は黙って混ぜる、では読む人が
    // 「置き換えたはず」と思ったまま両方描かれる。
    const parsed = parseFence('board: 10x6\nparts:\n  R1: resistor b3 b7\nparts:\n  R2: resistor c1 c4\n');

    expect(parsed.errors.some((e) => e.message.includes('2 つ'))).toBe(true);
  });

  test('says a package it cannot draw yet is not drawn, rather than ignoring it', () => {
    const parsed = parseFence('board: 10x6\nparts:\n  C1: capacitor/electrolytic a1 a4\n');

    expect(parsed.doc?.parts[0]?.variant).toBe('electrolytic');
    expect(parsed.errors.some((e) => e.notice === true && e.message.includes('electrolytic'))).toBe(true);
  });
});
