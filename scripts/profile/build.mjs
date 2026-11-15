// ビルドの段ごとの時間と最大のメモリを測る (52 の docs/162 の段 1)。
//
//   node scripts/profile/build.mjs                     全パッケージ・既定の段
//   node scripts/profile/build.mjs typecheck test      段を選ぶ
//   node scripts/profile/build.mjs --only=circuit-fence,fence-kit
//
// 測るのは package.json の scripts にある段だけ。図を焼く段 (examples・docs) は examples/out を書き換えるので、
// 既定では測らない (`--write` を付けたときだけ。測ったあと git で戻すこと)。
import { fileURLToPath } from 'node:url';
import { ROOT, manifest, packages, round, save, table, timed } from './lib.mjs';

const args = process.argv.slice(2);
const only = args.find((arg) => arg.startsWith('--only='))?.slice(7).split(',') ?? null;
const write = args.includes('--write');
const named = args.filter((arg) => !arg.startsWith('--'));
const SAFE = ['build', 'typecheck', 'test', 'types'];
const WRITING = ['gallery', 'examples', 'docs', 'schematics'];
const stages = named.length > 0 ? named : [...SAFE, ...(write ? WRITING : [])];

const rows = [];
for (const name of packages().filter((pkg) => only === null || only.includes(pkg))) {
  const scripts = manifest(name).scripts ?? {};
  for (const stage of stages) {
    if (scripts[stage] === undefined) continue;
    if (WRITING.includes(stage) && !write) continue;
    const result = timed('npm', ['run', '-s', stage], fileURLToPath(new URL(`packages/${name}/`, ROOT)));
    rows.push({ package: name, stage, ...result });
    console.error(`${name} ${stage}: ${result.seconds} s, ${result.megabytes} MB${result.ok ? '' : ' (失敗)'}`);
  }
}

const path = save('build', { when: new Date().toISOString(), rows });
console.log(table(['パッケージ', '段', '時間 (s)', 'メモリ (MB)'],
  rows.map((row) => [row.package, row.stage, round(row.seconds, 1), row.megabytes ?? '—'])));
const total = (stage) => rows.filter((row) => row.stage === stage).reduce((sum, row) => sum + (row.seconds ?? 0), 0);
console.log(`\n${table(['段', '合計 (s)', '最大のメモリ (MB)'], [...new Set(rows.map((row) => row.stage))].map((stage) =>
  [stage, round(total(stage), 1), Math.max(...rows.filter((row) => row.stage === stage).map((row) => row.megabytes ?? 0))]))}`);
console.error(`→ ${path}`);
