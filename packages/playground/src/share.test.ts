import { describe, expect, test } from 'vitest';
import { decodeShare, encodeShare } from './share.ts';

/** 読めた前提で中身だけ取る (読めなければ落ちる)。 */
const read = (hash: string): string => {
  const said = decodeShare(hash);
  if (said === null || !said.ok) throw new Error(`読めませんでした: ${hash.slice(0, 40)}`);
  return said.source;
};

describe('encodeShare / decodeShare', () => {
  test('書いたフェンスを往復させても字が変わらない', () => {
    // Arrange
    const source = 'title: 図01 LED と抵抗\nboard: half\n';

    // Act
    const back = decodeShare(encodeShare('breadboard', source));

    // Assert
    expect(back).toEqual({ ok: true, kind: 'breadboard', source });
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
    expect(read(encodeShare('perfboard', source))).toBe(source);
  });

  test('先頭の # が付いていても読める', () => {
    const hash = encodeShare('breadboard', 'board: half\n');

    expect(read(`#${hash}`)).toBe('board: half\n');
  });

  test('長いフェンスでも落ちない (btoa の引数の上限)', () => {
    const source = 'board: half\n'.repeat(5_000);

    expect(read(encodeShare('breadboard', source))).toBe(source);
  });

  test('短い綴りのリンクも読める', () => {
    // 52 の docs/08 で綴りを短くすると決めてある。正を入れ替える日に
    // 配ってあるリンクが切れないよう、両方を読めるようにしてある。
    const hash = `bread/${encodeShare('breadboard', 'board: half\n').split('/')[1] ?? ''}`;

    expect(decodeShare(hash)).toEqual({ ok: true, kind: 'breadboard', source: 'board: half\n' });
  });

  /**
   * **読めないリンクは黙って捨てない** (約束 6)。既定の例に落ちるだけだと、
   * 渡した相手には「別の図が出た」としか見えない。
   */
  describe('読めなかったとき', () => {
    test('知らない種類は、その綴りを添えて断る', () => {
      const said = decodeShare('vector/eA');

      expect(said).toMatchObject({ ok: false });
      expect(said && !said.ok && said.why).toContain('vector');
    });

    test('種類だけで中身が無ければ断る', () => {
      expect(decodeShare('breadboard/')).toMatchObject({ ok: false });
    });

    test('base64 として読めなければ断る', () => {
      expect(decodeShare('breadboard/****')).toMatchObject({ ok: false });
    });

    test('長すぎる綴りは切って返す (画面を押し流さない)', () => {
      const said = decodeShare(`${'z'.repeat(500)}/eA`);

      expect(said && !said.ok && said.why.length).toBeLessThan(80);
    });
  });

  /**
   * **共有リンクでないものには何も言わない。** ただの `#見出し` へ飛んだだけの
   * ハッシュに「読めません」と出すと、そちらのほうが嘘になる。
   */
  describe('そもそも共有リンクでないもの', () => {
    test('区切りが無ければ null', () => {
      expect(decodeShare('breadboard')).toBeNull();
      expect(decodeShare('midashi')).toBeNull();
    });

    test('空のハッシュは null', () => {
      expect(decodeShare('')).toBeNull();
      expect(decodeShare('#')).toBeNull();
    });
  });
});
