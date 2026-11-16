#!/usr/bin/env node
// ESLint をパッケージごとに順に回す (52 の docs/164)。設定は根の eslint.config.mjs。
//
//   npm run lint                       全部のパッケージ
//   npm run lint -- circuit-fence      名指ししたパッケージだけ
//   npm run lint -- --fix              直せる物は直す (ESLint にそのまま渡す)
//
// **1 回の ESLint に全部を渡さない。** 型の情報を使う規則は、パッケージごとの tsconfig から型の世界を作る。
// 全部を 1 回で回すと 14 の世界を同時に抱えて 3.9 GB 使った。パッケージごとに別のプロセスで回すと、
// 大きい circuit-fence でも 1.05 GB で収まる (型チェックの約 2 倍。ESLint が構文木も持つ分)。
// ヒープの上限は、それが膨らんだら早く気づくための物。
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const HEAP_MB = 1536;
const ROOT = new URL('../', import.meta.url).pathname;
const args = process.argv.slice(2);
const named = args.filter((arg) => !arg.startsWith('-'));
const passed = args.filter((arg) => arg.startsWith('-'));
const all = readdirSync(`${ROOT}packages`).filter((name) => existsSync(`${ROOT}packages/${name}/src`)).sort();
const unknown = named.filter((name) => !all.includes(name));
if (unknown.length > 0) {
  console.error(`知らないパッケージです: ${unknown.join(', ')} (あるのは ${all.join(' ')})`);
  process.exit(2);
}
// bin は exports に無いので、package.json の場所から辿る。
const eslint = join(dirname(createRequire(import.meta.url).resolve('eslint/package.json')), 'bin/eslint.js');

const failed = [];
for (const name of named.length > 0 ? named : all) {
  const run = spawnSync(process.execPath, [`--max-old-space-size=${HEAP_MB}`, eslint, ...passed, `packages/${name}/src`], { cwd: ROOT, stdio: 'inherit' });
  if (run.status !== 0) failed.push(name);
}
if (failed.length > 0) {
  console.error(`\nlint が落ちたパッケージ: ${failed.join(', ')}`);
  process.exit(1);
}
