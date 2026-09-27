#!/usr/bin/env node
// examples/ の CSV を**計算で**作る。実測ではない (ファイルの頭の注釈にも書く)。
//
//   node scripts/fakeData.mjs
//
// 例に実測を置くと、版を上げるたびに測り直せない。形は WaveForms の Scope の
// Export → CSV と同じ (# の頭書き、`Time (s),Channel 1 (V),Channel 2 (V)`、t = 0 がトリガ)。
// 値は電験 5-1 (0〜2 V・100 Hz の方形波を τ = 1 ms の RC に) の定常に、ノイズ ±5 mV と
// ADC の刻み (14 bit、±2.5 V の範囲) を足したもの。**種を固定する** (同じ入力は同じ図)。
// 記録は画面 (1ms/div = 10 ms) の前後を足した 20 ms (2 周期) — 画面にちょうど 1 周期だと
// 周波数を測る横切りが 1 つしか入らない。

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

const TAU = 1e-3;
const HALF = 5e-3;
const LOW = (2 * Math.exp(-HALF / TAU)) / (1 + Math.exp(-HALF / TAU));
const STEP = 5 / 2 ** 14;
const NOISE = 5e-3;

/** 5-1 の定常。t = 0 で入力が立ち上がる。 */
function ideal(t) {
  const phase = ((t % 10e-3) + 10e-3) % 10e-3;
  if (phase < HALF) return [2, 2 - (2 - LOW) * Math.exp(-phase / TAU)];
  return [0, (2 - LOW) * Math.exp(-(phase - HALF) / TAU)];
}

const next = random(51);
const measured = (value) => Math.round((value + (next() * 2 - 1) * NOISE) / STEP) * STEP;

const rate = 100e3;
const samples = 2001;
const lines = [
  '#Digilent WaveForms Oscilloscope Acquisition',
  '#Note: scope-fence の例のための計算した値 (実測ではない)。scripts/fakeData.mjs が書く',
  '#Device Name: Discovery2',
  '#Serial Number: SN:000000000000',
  '#Date Time: 2026-09-28 00:00:00.000.000.000',
  `#Sample rate: ${rate}Hz`,
  `#Samples: ${samples}`,
  '#Trigger: Source: Channel 1 Type: Edge Condition: Rise Level: 1 V Hysteresis: 10 mV HoldOff: 0 s',
  '#Channel 1: Range: 500 mV/div Offset: -1 V',
  '#Channel 2: Range: 500 mV/div Offset: -1 V',
  'Time (s),Channel 1 (V),Channel 2 (V)',
];
for (let index = 0; index < samples; index += 1) {
  const t = (index - (samples - 1) / 2) / rate;
  const [ch1, ch2] = ideal(t);
  lines.push([t.toExponential(6), measured(ch1).toFixed(6), measured(ch2).toFixed(6)].join(','));
}
writeFileSync(join(OUT, '00-rc-charging-ch.csv'), `${lines.join('\n')}\n`);
console.log(`00-rc-charging-ch.csv (${samples} 点)`);
