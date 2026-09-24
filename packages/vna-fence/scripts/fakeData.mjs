#!/usr/bin/env node
// examples/ の Touchstone を**計算で**作る。実測ではない (ファイルの頭の注釈にも書く)。
//
//   node scripts/fakeData.mjs
//
// 例に実測を置くと、版を上げるたびに測り直せない。形は NanoVNA-Saver が書くものと
// 同じ (# HZ S RI R 50、101 点)。値は「直列の Z を 50 Ω 系に入れた」ときの S。

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = new URL('../examples/', import.meta.url).pathname;

/** 直列の Z (複素数 [re, im]) の S11 / S21。S は対称 (S22 = S11、S12 = S21)。 */
function seriesS([zr, zi]) {
  // S11 = Z / (Z + 100)、S21 = 100 / (Z + 100)
  const dr = zr + 100;
  const di = zi;
  const d = dr * dr + di * di;
  const s11 = [(zr * dr + zi * di) / d, (zi * dr - zr * di) / d];
  const s21 = [(100 * dr) / d, (-100 * di) / d];
  return { s11, s21 };
}

const fmt = (value) => value.toFixed(6);

function write(name, header, start, stop, points, zOf) {
  const lines = [...header.map((line) => `! ${line}`), '# HZ S RI R 50'];
  for (let index = 0; index < points; index += 1) {
    const f = Math.round(start + ((stop - start) * index) / (points - 1));
    const { s11, s21 } = seriesS(zOf(f));
    lines.push([f, ...s11, ...s21, ...s21, ...s11].map((value, at) => (at === 0 ? String(value) : fmt(value))).join(' '));
  }
  writeFileSync(join(OUT, name), `${lines.join('\n')}\n`);
  console.log(`${name} (${points} 点)`);
}

// 3-1: 100 Ω の抵抗 + リード 1 cm ぶんの直列 10 nH と、足の間の 0.3 pF。
write('00-series-100.s2p', [
  'vna-fence の例のための**計算した値** (実測ではない)。scripts/fakeData.mjs が書く',
  '100 Ω に、リードの直列 10 nH と足の間の 0.3 pF を足した模型',
], 1e6, 300e6, 101, (f) => {
  const w = 2 * Math.PI * f;
  // (100 + jωL) || (1 / jωC)
  const [ar, ai] = [100, w * 10e-9];
  const [br, bi] = [0, -1 / (w * 0.3e-12)];
  const [nr, ni] = [ar * br - ai * bi, ar * bi + ai * br];
  const [sr, si] = [ar + br, ai + bi];
  const d = sr * sr + si * si;
  return [(nr * sr + ni * si) / d, (ni * sr - nr * si) / d];
});

// 3-1 の開放: 何も入れない治具。SMA どうしの漏れを 0.15 pF の直列で。
write('00-series-open.s2p', [
  'vna-fence の例のための**計算した値** (実測ではない)。scripts/fakeData.mjs が書く',
  '何も入れない治具の漏れを、直列 0.15 pF とした模型',
], 1e6, 300e6, 101, (f) => [0, -1 / (2 * Math.PI * f * 0.15e-12)]);
