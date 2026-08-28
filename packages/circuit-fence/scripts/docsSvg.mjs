#!/usr/bin/env node
// docs/out の図を GitHub 用に仕上げる。`npm run docs` の最後の工程。
//
// なぜ要るか: フェンスの図は GitHub では <img> で出すしかないが、素の SVG は
// 2 つの理由でそのままでは読めない。
//
// - 既定テーマ auto の線は currentColor で、プレビューでは地の文字色を拾うが、
//   <img> では継承する色が無く黒に落ちる (ダークテーマで回路が見えない)。
//   → light テーマの ink に落とし、その図の paper 色で下地を敷く。
// - 文字は TeX フォント (cmr10 など) の <text> で、字形はプレビューに同梱の
//   webfont が解決している。GitHub にはそのフォントが無く、Ω などが別の字に
//   化ける。→ フォントの解決を手元で済ませ、PNG に焼いたものを貼る。
//
// 開発時だけのスクリプトなので、テーマの解決は dist の core をそのまま使い、
// PNG は README と同じく sharp で作る (scripts/png.mjs と同じ考え)。

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { compileCircuit, extractCircuitFences } from '../dist/core.mjs';

const SOURCE = 'docs/01-syntax.md';
const OUT_DIR = 'docs/out';
const DENSITY = 144; // 1.5x 相当 (scripts/png.mjs と同じ値)

/** auto テーマの currentColor をこの色に落とす (theme.ts の light の ink と同じ値)。 */
const LIGHT_INK = '#1f2328';

/** 焼き直した印。付いている図はもう一度焼かない (下地の rect を重ねない)。 */
const MARK = 'data-github-paper';

const ROOT_TAG = /<svg\b[^>]*\sviewBox="([-\d.]+) ([-\d.]+) ([\d.]+) ([\d.]+)"[^>]*>/;

const fences = extractCircuitFences(readFileSync(SOURCE, 'utf8'));

/** 出力名は CLI の jobsFor と同じ規則 (1 枚だけなら連番を付けない)。 */
const stemOf = (index) => (fences.length === 1 ? '01-syntax' : `01-syntax-${index + 1}`);

for (const [index, fence] of fences.entries()) {
  const path = join(OUT_DIR, `${stemOf(index)}.svg`);
  // 途中で気づいたら止める (png.mjs と同じく、開発時の道具は投げて終わる)。
  if (!existsSync(path)) throw new Error(`${path} がありません (先に render しましたか?)`);

  let svg = readFileSync(path, 'utf8');
  if (svg.includes(`${MARK}="`)) {
    console.log(`${path} (焼き直し済み)`);
  } else {
    const root = ROOT_TAG.exec(svg);
    if (root === null) throw new Error(`${path}: viewBox が見つかりません`);

    const { theme } = compileCircuit(fence.source);
    const ink = theme.ink === 'currentColor' ? LIGHT_INK : theme.ink;
    const [tag, x, y, width, height] = root;
    const backdrop = `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${theme.paper}"/>`;
    const marked = tag.replace('<svg', `<svg ${MARK}="${theme.paper}"`);

    // 下地を差し込んでから色を落とす。逆にすると、根のタグの currentColor が
    // 先に書き換わって tag が見つからなくなる。
    svg = svg.replace(tag, `${marked}${backdrop}`).replaceAll('currentColor', ink);
    writeFileSync(path, svg);
    console.log(`${path} (GitHub 用に焼き直し)`);
  }

  const png = await sharp(Buffer.from(svg), { density: DENSITY }).png({ compressionLevel: 9 }).toBuffer();
  const target = join(OUT_DIR, `${stemOf(index)}.png`);
  writeFileSync(target, png);
  console.log(`${target} (${Math.round(png.byteLength / 1024)} KB)`);
}
