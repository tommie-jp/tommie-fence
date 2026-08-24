#!/usr/bin/env node
// examples/out/*.svg を PNG にも書き出す。
//
// なぜ要るか: Marketplace 用の README には SVG を貼れない (vsce が弾く) ので、
// README の図だけ PNG を参照する。docs/ の図は SVG のままでよい。
// 開発時だけのスクリプトなので、sharp は devDependency に置く。

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const OUT_DIR = 'examples/out';
const DENSITY = 144; // 1.5x 相当。README でくっきり見える最小限

const svgFiles = readdirSync(OUT_DIR).filter((name) => name.endsWith('.svg')).sort();

for (const name of svgFiles) {
  const source = readFileSync(join(OUT_DIR, name));
  const png = await sharp(source, { density: DENSITY }).png({ compressionLevel: 9 }).toBuffer();
  const target = join(OUT_DIR, name.replace(/\.svg$/, '.png'));
  writeFileSync(target, png);
  console.log(`${target} (${Math.round(png.byteLength / 1024)} KB)`);
}
