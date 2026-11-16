#!/usr/bin/env node
// 例と文書の図の PNG (`packages/*/examples/out/*.png`・`packages/*/docs/out/*.png`) は、
// **本文から指している物だけを追跡する** (52 の docs/164)。
//
//   node scripts/images.mjs           過不足を直す (指されていない PNG を追跡から外し、指されているのに追跡していない PNG を足す)
//   node scripts/images.mjs --check   過不足を言って 1 で終わる
//
// なぜ: 図の右下には処理系の版が入るので、図を描き直すたびに PNG が全部変わる。PNG は差分で縮まないので、
// 変わるたびに丸ごと履歴に積もる (2026-11 の時点で履歴 388 MB のうち 362 MB が例の PNG)。例の `.md` が指すのは
// SVG で、PNG の多くはどこからも指されていなかった。PNG は手元で目で確かめる用に描き続け (`.gitignore` 済み)、
// README・ギャラリー・Marketplace など本文が PNG を指している物だけを追跡する。
//
// 「指している」の数え方: 追跡している `.md` `.html` の中の `](パス)` と `src="パス"` を、その文書の場所から解く。
// raw.githubusercontent.com / github.com の このリポジトリへの絶対 URL (拡張の README) も解く。
// node と git だけで動く (CI では npm ci の前に走る)。

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';

const ROOT = new URL('../', import.meta.url).pathname;
const REPO_URL = /^https:\/\/(?:raw\.githubusercontent\.com\/tommie-jp\/tommie-fence\/[^/]+|github\.com\/tommie-jp\/tommie-fence\/(?:blob|raw)\/[^/]+)\//;
/** 追跡を絞る PNG の置き場。 */
export const MANAGED = /^packages\/[^/]+\/(?:examples|docs)\/out\/.+\.png$/;

const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const tracked = () => git('ls-files', '-z').split('\0').filter(Boolean);

/** 文書 1 つの中の図への参照 (リポジトリの直下からのパス)。外の URL は捨てる。 */
export function referencesIn(documentPath, text) {
  const found = new Set();
  const pattern = /\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)|\bsrc\s*=\s*["']([^"']+)["']/g;
  for (const match of text.matchAll(pattern)) {
    const raw = (match[1] ?? match[2]).replace(/[?#].*$/, '');
    if (!/\.(?:png|svg)$/i.test(raw)) continue;
    let path;
    if (REPO_URL.test(raw)) path = raw.replace(REPO_URL, '');
    else if (/^[a-z]+:/i.test(raw) || raw.startsWith('//')) continue;
    else path = normalize(join(dirname(documentPath), decodeURI(raw)));
    if (!path.startsWith('..')) found.add(path);
  }
  return found;
}

/** 本文から指している図の全部。 */
export function referencedImages(files, read) {
  const all = new Set();
  for (const file of files.filter((name) => /\.(?:md|html)$/.test(name))) {
    for (const path of referencesIn(file, read(file))) all.add(path);
  }
  return all;
}

function main() {
  const check = process.argv.includes('--check');
  const files = tracked();
  const trackedSet = new Set(files);
  const referenced = referencedImages(files, (file) => readFileSync(join(ROOT, file), 'utf8'));

  const unreferenced = files.filter((file) => MANAGED.test(file) && !referenced.has(file));
  const untracked = [...referenced].filter((file) => MANAGED.test(file) && !trackedSet.has(file)).sort();
  const missing = untracked.filter((file) => !existsSync(join(ROOT, file)));
  const addable = untracked.filter((file) => existsSync(join(ROOT, file)));

  if (check) {
    const problems = [
      ...unreferenced.map((file) => `指されていないのに追跡している: ${file}`),
      ...addable.map((file) => `指されているのに追跡していない: ${file}`),
      ...missing.map((file) => `指されているのに無い (図を作り直す: npm run examples): ${file}`),
    ];
    if (problems.length === 0) return;
    console.error(problems.join('\n'));
    console.error(`\n直し方: node scripts/images.mjs (${unreferenced.length + addable.length} 件を直す)。無い図は先に作る`);
    process.exit(1);
  }

  if (unreferenced.length > 0) git('rm', '--cached', '--quiet', '--', ...unreferenced);
  if (addable.length > 0) git('add', '--force', '--', ...addable);
  console.log(`追跡から外した: ${unreferenced.length} / 足した: ${addable.length}`);
  for (const file of missing) console.error(`指されているのに無い (図を作り直す: npm run examples): ${file}`);
  if (missing.length > 0) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
