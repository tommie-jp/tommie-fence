#!/usr/bin/env node
// 書き出した図を、フェンスの外でも読める形に仕上げる。
// `npm run examples` / `npm run docs` の最後の工程。
//
//   node scripts/figures.mjs <ソース (.md かディレクトリ)> <出力先>
//
// なぜ要るか: `.md` に貼った図も README の図も、GitHub では <img> で出る。
// プレビューの中とは条件が 2 つ違うので、素の SVG はそのままでは読めない。
//
// - 既定テーマ auto の線は currentColor。プレビューでは地の文字色を拾うが、
//   <img> には継承する色が無く黒に落ちる (暗い地で回路が見えない)。
//   → light テーマの色に落とし、地の色で下地を敷く。
// - 字は TeX フォント (cmr10 など) の <text> で、字形はプレビューに同梱の
//   webfont が解決している。GitHub にはそのフォントが無く、`Ω` が `¬` に
//   化ける。→ フォントの解決を手元で済ませ、PNG に焼いたものを貼る。
//
// 開発時だけの道具なので、テーマの解決は dist の core をそのまま使い、
// 途中で気づいたことは投げて止める (npm がそのまま失敗にしてくれる)。
//
// **PNG は手元のフォント環境で焼ける**。TeX フォントの無いマシンで作り直すと
// 化けた図がコミットされるので、CI では中身の一致を求めない (.tex だけ見る)。

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import sharp from 'sharp';
import { LIGHT_THEME, compileCircuit, extractCircuitFences, outputStem } from '../dist/core.mjs';

const [source, outDir] = process.argv.slice(2);
if (!source || !outDir) throw new Error('使い方: node scripts/figures.mjs <ソース> <出力先>');

const DENSITY = 144; // 1.5x 相当。README でくっきり見える最小限

/** 焼いた印。付いている図は焼き直さない (下地の rect を重ねない)。 */
const MARK = 'data-figure-paper';

const ROOT_TAG = /<svg\b[^>]*\sviewBox="([-\d.]+)\s+([-\d.]+)\s+([\d.]+)\s+([\d.]+)"[^>]*>/;

const isMarkdown = (path) => ['.md', '.markdown'].includes(extname(path));

/** 見るファイルの選び方は CLI の collectFiles と同じ (下の階層は見ない)。 */
const filesOf = (target) =>
  statSync(target).isDirectory()
    ? readdirSync(target)
        .map((name) => join(target, name))
        .filter((path) => statSync(path).isFile() && isMarkdown(path))
        .sort()
    : [target];

/**
 * その図を焼く色。
 *
 * `auto` は「読み手の文字色に合わせる」テーマなので、フェンスの外に出すときは
 * 拠り所が無い。明るい地に決め打ちする (line と paper を揃えて取る)。
 * 地の色だけを書いて線を `auto` のままにした図は、明暗のどちらに寄せるべきか
 * こちらから決められないので、書き手に決めてもらう。
 */
function paintOf(theme, label) {
  if (theme.followsEditor) return { ink: LIGHT_THEME.ink, paper: LIGHT_THEME.paper };
  if (theme.ink === 'currentColor') {
    throw new Error(`${label}: 地の色だけでは焼けません (theme か ink-color も書いてください)`);
  }
  return { ink: theme.ink, paper: theme.paper };
}

for (const file of filesOf(source)) {
  const fences = extractCircuitFences(readFileSync(file, 'utf8'));

  for (const [index, fence] of fences.entries()) {
    const stem = outputStem(basename(file, extname(file)), index, fences.length);
    const svgPath = join(outDir, `${stem}.svg`);
    let svg = readFileSync(svgPath, 'utf8');

    if (svg.includes(`${MARK}="`)) {
      console.log(`${svgPath} (焼き直し済み)`);
    } else {
      const root = ROOT_TAG.exec(svg);
      if (root === null) throw new Error(`${svgPath}: viewBox が見つかりません`);

      const { ink, paper } = paintOf(compileCircuit(fence.source).theme, svgPath);
      const [tag, x, y, width, height] = root;
      const backdrop = `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${paper}"/>`;
      const marked = tag.replace('<svg', `<svg ${MARK}="${paper}"`);

      // 下地を差し込んでから色を落とす。逆にすると、根のタグの currentColor が
      // 先に書き換わって tag が見つからなくなる。色は**属性の値だけ**を見る
      // (注釈の字に同じ語を書かれても触らない)。
      svg = svg.replace(tag, `${marked}${backdrop}`).replaceAll('"currentColor"', `"${ink}"`);
      writeFileSync(svgPath, svg);
      console.log(`${svgPath} (焼き直し)`);
    }

    const png = await sharp(Buffer.from(svg), { density: DENSITY }).png({ compressionLevel: 9 }).toBuffer();
    const pngPath = join(outDir, `${stem}.png`);
    writeFileSync(pngPath, png);
    console.log(`${pngPath} (${Math.round(png.byteLength / 1024)} KB)`);
  }
}
