#!/usr/bin/env node
// ```perf フェンスの番地を、基板のシルクの綴り (名前の基板の既定) に書き換える。**一度だけ使う。**
//
//   node scripts/migrate-silk.mjs [--check] <.md かディレクトリ...>
//
// 既定が `fence` から基板の刷りどおりに変わった (52 の docs/108) ので、名前の基板
// (`akizuki-c`・`7x5cm` など) で書いた図は、図が同じになるよう綴りを替える。
// **二度掛けない** (番地がもう一度替わる)。--check は書かずに、替わるフェンスの数だけ言う。
// 本文 (地の文) に書いた番地は替わらない。`grep` で拾って手で直す。

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { extractPerfboardFences } from '../src/core/fences.ts';
import { migrateSilk } from '../src/core/migrate/silk.ts';

const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const targets = args.filter((arg) => arg !== '--check');
if (targets.length === 0) throw new Error('使い方: node scripts/migrate-silk.mjs [--check] <.md かディレクトリ...>');

/** ディレクトリは下の階層まで見る (教科書は章ごとに分かれている)。 */
function markdownFilesOf(target) {
  if (!statSync(target).isDirectory()) return [target];
  return readdirSync(target).sort().flatMap((name) => {
    if (name === 'node_modules' || name.startsWith('.')) return [];
    const path = join(target, name);
    return statSync(path).isDirectory() ? markdownFilesOf(path) : extname(path) === '.md' ? [path] : [];
  });
}

let changedFences = 0;
let problemFences = 0;
for (const file of targets.flatMap(markdownFilesOf)) {
  const text = readFileSync(file, 'utf8');
  if (text.includes('\r')) {
    console.error(`${file}: 改行が CRLF です。先に LF にしてください`);
    problemFences += 1;
    continue;
  }
  const lines = text.split('\n');
  let touched = false;
  for (const fence of extractPerfboardFences(text).reverse()) {
    const bodyLines = fence.source.replace(/\n$/, '').split('\n');
    const start = fence.line; // 開き記号の次の行 (0 始まりの添字)
    if (lines.slice(start, start + bodyLines.length).join('\n') !== bodyLines.join('\n')) {
      console.error(`${file}:${fence.line}: フェンスの中身を本文から探せませんでした`);
      problemFences += 1;
      continue;
    }
    const result = migrateSilk(fence.source);
    for (const problem of result.problems) {
      console.error(`${file}:${fence.line}: ${problem}`);
      problemFences += 1;
    }
    if (!result.changed) continue;
    changedFences += 1;
    touched = true;
    lines.splice(start, bodyLines.length, ...result.source.replace(/\n$/, '').split('\n'));
  }
  if (touched && !checkOnly) writeFileSync(file, lines.join('\n'));
  if (touched) console.log(`${file}: 替えました${checkOnly ? ' (--check: 書いていません)' : ''}`);
}
console.log(`番地を替えたフェンス: ${changedFences}、確かめて合わなかったフェンス: ${problemFences}`);
process.exitCode = problemFences === 0 ? 0 : 1;
