#!/usr/bin/env node
// examples/ の CSV を**計算で**作る。実測ではない (ファイルの頭の注釈にも書く)。
//
//   node scripts/fakeData.mjs
//
// 例に実測を置くと、版を上げるたびに測り直せない。形は tinySA の SAVE TRACES を写した物
// (見出し無し、周波数 Hz とレベル dBm の 2 列。実物で確かめるまでは仮 — 52 の docs/88 §5)。
// 値は本の 11-12 (アンテナで FM 放送帯を受ける): tinySA Ultra の RBW 100 kHz のフロア
// (−102 + 10 log10(100 / 30) = −96.8 dBm) に ±2 dB の揺れと、3 つの局 (山の幅は FM の
// 占有帯域ほど)。**種を固定する** (同じ入力は同じ図)。

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = new URL('../examples/', import.meta.url).pathname;

/** 種を固定した一様乱数 (mulberry32)。 */
function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const START = 76e6;
const STOP = 95e6;
const POINTS = 450;
const FLOOR = -102 + 10 * Math.log10(100 / 30);
const JITTER = 2;
/** 局 (周波数・電力 dBm)。 */
const STATIONS = [
  [80.0e6, -48],
  [82.5e6, -58],
  [90.5e6, -52],
];
/** 山の幅 (−3 dB の全幅)。FM の占有帯域 ± 100 kHz ほど。 */
const WIDTH = 200e3;

const next = random(1112);
const lines = [
  '# tinySA Ultra の SAVE TRACES の形 (見出し無し、Hz と dBm)',
  '# spectrum-fence の例のための計算した値 (実測ではない)。scripts/fakeData.mjs が書く',
];
for (let index = 0; index < POINTS; index += 1) {
  const f = START + ((STOP - START) * index) / (POINTS - 1);
  let mw = 10 ** ((FLOOR + (next() * 2 - 1) * JITTER) / 10);
  for (const [center, dbm] of STATIONS) {
    const x = (f - center) / WIDTH;
    mw += 10 ** (dbm / 10) * Math.exp(-4 * Math.LN2 * x * x);
  }
  lines.push(`${Math.round(f)},${(10 * Math.log10(mw)).toFixed(2)}`);
}
writeFileSync(join(OUT, '05-antenna-fm.csv'), `${lines.join('\n')}\n`);
console.log(`05-antenna-fm.csv (${POINTS} 点)`);
