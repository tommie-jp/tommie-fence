import { describe, expect, test } from 'vitest';
import { decodeShare, encodeShare } from './share.ts';

describe('encodeShare / decodeShare', () => {
  test('書いたフェンスを往復させても字が変わらない', () => {
    // Arrange
    const source = 'title: 図01 LED と抵抗\nboard: half\n';

    // Act
    const back = decodeShare(encodeShare('breadboard', source));

    // Assert
    expect(back).toEqual({ kind: 'breadboard', source });
  });

  test('種類はリンクの頭に平文で載る', () => {
    expect(encodeShare('circuit', 'x')).toMatch(/^circuit\//);
  });

  test('URL に置けない字を含まない (base64 の + / = を置き換える)', () => {
    // Arrange: base64 に + と / と詰め物が出る並びを作る。
    const source = Array.from({ length: 256 }, (_, code) => String.fromCharCode(code)).join('');

    // Act
    const payload = encodeShare('perfboard', source).split('/')[1] ?? '';

    // Assert
    expect(payload).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeShare(encodeShare('perfboard', source))?.source).toBe(source);
  });

  test('先頭の # が付いていても読める', () => {
    const hash = encodeShare('breadboard', 'board: half\n');

    expect(decodeShare(`#${hash}`)?.source).toBe('board: half\n');
  });

  test('長いフェンスでも落ちない (btoa の引数の上限)', () => {
    const source = 'board: half\n'.repeat(5_000);

    expect(decodeShare(encodeShare('breadboard', source))?.source).toBe(source);
  });

  test('知らない種類は受け取らない', () => {
    expect(decodeShare('vector/eA')).toBeNull();
  });

  test('種類だけで中身が無ければ受け取らない', () => {
    expect(decodeShare('breadboard/')).toBeNull();
  });

  test('区切りが無ければ受け取らない', () => {
    expect(decodeShare('breadboard')).toBeNull();
  });

  test('base64 として読めなければ受け取らない', () => {
    expect(decodeShare('breadboard/****')).toBeNull();
  });

  test('空のハッシュは受け取らない', () => {
    expect(decodeShare('')).toBeNull();
    expect(decodeShare('#')).toBeNull();
  });
});
