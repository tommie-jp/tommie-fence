// 回路図の番地を旧い綴り (`a1` `a1f5`) から `x,y` (`1,1` `1.5,1.5`) に書き直す (52 の docs/126)。
// 使い方: node scripts/migrate-address.mjs <ファイルかディレクトリ...>
//
// **書き直すのは ```circuit フェンスの中だけ。** 本文 (フェンスの外) が番地を指している所は
// 機械では決められないので、grep して手で直す。ブレッドボードとユニバーサル基板の
// 穴の名前 (`a5`) は別のフェンスなので触らない。
//
// 中身は core の `migrateCircuitFences` (拡張のクイックフィックスと playground の
// 「書き換える」釦と同じ物)。旧い読み手で番地として読めた綴りだけを書き換え、
// 番地を書く場所にあったのに読めなかった語は最後に一覧で出す (目で見て直す)。
import { readFileSync, writeFileSync, statSync, readdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { migrateCircuitFences } from '../src/core/migrate.ts';

function* filesUnder(path) {
  if (statSync(path).isFile()) {
    yield path;
    return;
  }
  for (const name of readdirSync(path)) {
    if (name === 'node_modules' || name === 'out' || name === 'dist' || name === 'coverage' || name.startsWith('.')) continue;
    yield* filesUnder(join(path, name));
  }
}

let changed = 0;
let files = 0;
const skipped = new Map();
for (const target of process.argv.slice(2)) {
  for (const path of filesUnder(target)) {
    if (extname(path) !== '.md') continue;
    const before = readFileSync(path, 'utf8');
    const result = migrateCircuitFences(before);
    for (const word of result.skipped) skipped.set(`${path}: ${word}`, (skipped.get(`${path}: ${word}`) ?? 0) + 1);
    if (result.changed === 0) continue;
    writeFileSync(path, result.text);
    files += 1;
    changed += result.changed;
    console.log(`${path}: ${result.changed}`);
  }
}
console.log(`\n書き直した: ${changed} か所 / ${files} ファイル`);
if (skipped.size > 0) {
  console.log('\n番地を書く場所にあったが読めなかった語 (そのまま):');
  for (const [written, count] of skipped) console.log(`  ${written} × ${count}`);
}
