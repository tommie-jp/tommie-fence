import { describe, expect, test } from 'vitest';
import { qrSvg } from './qr.ts';

/**
 * この頁の URL を入れた QR。**符号そのものは `qrcode-generator` の受け持ち**
 * なので、ここで見るのは殻 — 図の形、静かな縁、入らない長さの断り方。
 */

const SHORT = 'https://tommie-jp.github.io/tommie-fence/';

/** 図の 1 辺 (px)。`width` から読む。 */
const sideOf = (svg: string): number => Number(/width="(\d+)"/.exec(svg)?.[1] ?? '0');

describe('QR', () => {
  test('draws a square svg with the dark modules in one path', () => {
    const drawn = qrSvg(SHORT) ?? '';

    expect(drawn).toContain('<svg');
    expect(drawn).toContain('<path');
    expect(sideOf(drawn)).toBeGreaterThan(0);
    expect(drawn).toContain(`height="${sideOf(drawn)}"`);
  });

  test('paints the ground white, so a dark page does not swallow it', () => {
    // 暗い配色の頁でも、QR は白地に黒でないとカメラが読めない。
    expect(qrSvg(SHORT)).toContain('fill="#ffffff"');
  });

  test('leaves the quiet border the standard asks for', () => {
    // 静かな縁は 4 升。削ると読めなくなるので、地の四角より内側から描き始める。
    const drawn = qrSvg(SHORT) ?? '';
    const first = /M(\d+) (\d+)/.exec(drawn);

    expect(Number(first?.[1] ?? 0)).toBeGreaterThanOrEqual(16);
    expect(Number(first?.[2] ?? 0)).toBeGreaterThanOrEqual(16);
  });

  test('grows the figure as the url grows, since a longer url needs a bigger code', () => {
    const long = `${SHORT}#breadboard/${'A'.repeat(400)}`;

    expect(sideOf(qrSvg(long) ?? '')).toBeGreaterThan(sideOf(qrSvg(SHORT) ?? ''));
  });

  test('draws a different code for a different url', () => {
    expect(qrSvg(SHORT)).not.toBe(qrSvg(`${SHORT}?other`));
  });

  test('says nothing for a url too long to fit, instead of throwing at the page', () => {
    // 共有リンクは本文を base64 で載せるので、大きな図では入りきらない。
    expect(qrSvg('x'.repeat(5000))).toBeNull();
  });

  test('reads a label out to anyone using a screen reader', () => {
    expect(qrSvg(SHORT)).toContain('aria-label');
  });
});
