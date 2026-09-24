#!/usr/bin/env node
// 書き出した SVG を PNG にも焼く。PNG は SVG の隣に置く。
//
//   node scripts/png.mjs <.svg かディレクトリ...>
//
// なぜ要るか: SVG を見られない読み手が 2 ついる。
// - Marketplace 用の README (vsce が SVG を弾く)。README の図だけ PNG を参照する。
//   docs/ の図は SVG のままでよい。`npm run examples` が examples/out を渡す。
// - 画像しか見られない道具 (AI エージェントの画像読み取りなど)。`render --out` で
//   書き出した先を渡せば、どの文書の図でも見せられる。
// 開発時だけのスクリプトなので、sharp は devDependency に置く。

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import sharp from 'sharp';

const targets = process.argv.slice(2);
if (targets.length === 0) throw new Error('使い方: node scripts/png.mjs <.svg かディレクトリ...>');

const DENSITY = 144; // 1.5x 相当。README でくっきり見える最小限

const isSvg = (path) => extname(path) === '.svg';

/** ディレクトリは直下の .svg だけを見る (CLI の collectFiles と同じく下の階層は見ない)。 */
function svgFilesOf(target) {
  if (statSync(target).isDirectory()) {
    return readdirSync(target).filter(isSvg).sort().map((name) => join(target, name));
  }
  if (!isSvg(target)) throw new Error(`${target}: .svg ではありません`);
  return [target];
}

const svgFiles = targets.flatMap(svgFilesOf);
if (svgFiles.length === 0) throw new Error(`.svg が見つかりません: ${targets.join(' ')}`);

for (const svgPath of svgFiles) {
  const png = await sharp(readFileSync(svgPath), { density: DENSITY }).png({ compressionLevel: 9 }).toBuffer();
  const pngPath = svgPath.replace(/\.svg$/, '.png');
  writeFileSync(pngPath, png);
  console.log(`${pngPath} (${Math.round(png.byteLength / 1024)} KB)`);
}
