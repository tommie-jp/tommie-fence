import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

/**
 * TeX のフォント (BaKoMa の TTF) を読む。`render --embed-fonts` が SVG に埋め込むため
 * (埋め込む処理は `core/render/fonts.ts`)。**ここだけがフォントのファイルの場所を知っている**。
 *
 * フォントは node-tikzjax に同梱されている (`css/bakoma/ttf/`)。プレビューが読み込んでいる
 * `css/fonts.css` と同じもので、描いた字の番号と合う。
 */

/** TeX のフォント名の形。これ以外の名前でファイルを開かない (フォルダの外へ出させない)。 */
const TEX_FONT = /^[a-z]+\d+$/;

/** node-tikzjax に同梱のフォントのフォルダ。 */
export function texFontDir(): string {
  // CLI は CommonJS に束ねるので require がある。試験 (ESM) では import.meta.url から作る。
  const resolve = typeof require === 'function' ? require.resolve : createRequire(import.meta.url).resolve;
  return join(dirname(resolve('node-tikzjax/package.json')), 'css', 'bakoma', 'ttf');
}

/** 名前 → TTF の base64。フォルダに無い名前は入れない。 */
export function loadTexFonts(families: readonly string[], dir: string): Map<string, string> {
  const fonts = new Map<string, string>();
  for (const family of families) {
    if (!TEX_FONT.test(family)) continue;
    const path = join(dir, `${family}.ttf`);
    if (existsSync(path)) fonts.set(family, readFileSync(path).toString('base64'));
  }
  return fonts;
}
