import { describe, expect, test } from 'vitest';
// 組み立ての道具なので置き場は `scripts/`。試験は `src/` からしか拾わない
// (vitest の include) ので、こちらから呼ぶ。
import { drawIcon, iconPng } from '../scripts/icon.mjs';

/**
 * PWA の絵札を焼くところ。**外からラスタライザを持ってこない**決めなので
 * (52 の docs/35)、詰め方が正しいことはこちらで見張る。
 *
 * 見るのは**PNG として読めるか**と**図案が出ているか**。見た目そのものは
 * 実機とブラウザで見る。
 */
describe('絵札を焼く', () => {
  /** PNG の頭 8 バイト。これで始まらないものはブラウザが絵として読まない。 */
  const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

  test('writes a PNG that starts with the signature every reader looks for', () => {
    const png = iconPng(192);

    expect([...png.subarray(0, 8)]).toEqual(SIGNATURE);
  });

  test('says its own size in the header, so the manifest and the file agree', () => {
    const png = iconPng(512);

    // IHDR の中身は署名 8 + 長さ 4 + 名前 4 = 16 バイト目から。
    expect(png.readUInt32BE(16)).toBe(512);
    expect(png.readUInt32BE(20)).toBe(512);
  });

  test('closes with IEND, or the reader keeps waiting for more', () => {
    const png = iconPng(192);

    expect(png.subarray(png.length - 8, png.length - 4).toString('ascii')).toBe('IEND');
  });

  test('draws the same thing every time, so a rebuild does not churn the file', () => {
    expect(iconPng(192).equals(iconPng(192))).toBe(true);
  });

  test('fills every pixel, since a maskable icon is cut to a circle', () => {
    // 透けている所があると、切り抜かれた縁が欠けて見える。
    const pixels = drawIcon(64);
    const clear = [...pixels].filter((_, at) => at % 4 === 3).filter((alpha) => alpha !== 0xff);

    expect(clear).toEqual([]);
  });

  test('puts the motif inside the safe zone, away from what the mask cuts', () => {
    const size = 64;
    const pixels = drawIcon(size);
    const paperAt = (x: number, y: number): boolean => {
      const at = (y * size + x) * 4;
      return pixels[at] === 0xf2 && pixels[at + 1] === 0xef && pixels[at + 2] === 0xe6;
    };

    // 四隅は地のまま (切り抜かれても図案は欠けない)。
    expect(paperAt(1, 1)).toBe(true);
    expect(paperAt(size - 2, 1)).toBe(true);
    expect(paperAt(1, size - 2)).toBe(true);
    expect(paperAt(size - 2, size - 2)).toBe(true);
  });

  test('draws the holes and the wire, not just an empty square', () => {
    const pixels = drawIcon(64);
    const colours = new Set<string>();
    for (let at = 0; at < pixels.length; at += 4) {
      colours.add(`${pixels[at]},${pixels[at + 1]},${pixels[at + 2]}`);
    }

    // 地・穴・配線の 3 色が出ている (縁を滑らかにした中間色も混じる)。
    expect(colours.has('242,239,230')).toBe(true);
    expect(colours.has('63,70,80')).toBe(true);
    expect(colours.has('193,68,14')).toBe(true);
  });
});
