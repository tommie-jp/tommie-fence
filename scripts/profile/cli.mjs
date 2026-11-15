// CLI で 1 冊 (ディレクトリ) を検める・描く時間と最大のメモリを測る (52 の docs/162 の段 3)。
//
//   node scripts/profile/cli.mjs <ディレクトリ>            9 つの CLI の check
//   node scripts/profile/cli.mjs <ディレクトリ> --render   render も (作業用の場所へ書く。回路図は TeX を回すので長い)
//   node scripts/profile/cli.mjs <ディレクトリ> --only=bread,perf
//
// 先に `npm run build` で dist/cli.cjs を作っておく。教科書の検査 (`npm run all`) と Pages の CI の時間はここで決まる。
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, round, save, table, timed } from './lib.mjs';

const args = process.argv.slice(2);
const target = args.find((arg) => !arg.startsWith('--'));
const withRender = args.includes('--render');
const only = args.find((arg) => arg.startsWith('--only='))?.slice(7).split(',') ?? null;
if (target === undefined) {
  console.error('使い方: node scripts/profile/cli.mjs <ディレクトリ> [--render] [--only=bread,perf]');
  process.exit(2);
}
// CLI はディレクトリの直下しか読まないので、下の章まで降りて .md を集めて渡す (教科書の検査と同じ渡し方)。
const SKIPPED = new Set(['node_modules', 'out', 'dist', '.git']);
const markdown = (dir) => (statSync(dir).isDirectory()
  ? readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap((entry) => {
    if (entry.isDirectory()) return SKIPPED.has(entry.name) || entry.name.startsWith('.') ? [] : markdown(join(dir, entry.name));
    return entry.name.endsWith('.md') ? [join(dir, entry.name)] : [];
  })
  : [dir]);
const inputs = markdown(resolve(target));
console.error(`.md ${inputs.length} 個`);

const NAMES = { bread: 'breadboard', perf: 'perfboard', circuit: 'circuit', copper: 'copper', vna: 'vna', scope: 'scope', spectrum: 'spectrum', graph: 'graph', logic: 'logic' };
const rows = [];
for (const [short, name] of Object.entries(NAMES)) {
  if (only !== null && !only.includes(short)) continue;
  const cli = fileURLToPath(new URL(`packages/${name}-fence/dist/cli.cjs`, ROOT));
  if (!existsSync(cli)) {
    console.error(`${cli} がありません (npm run build を先に)`);
    process.exit(1);
  }
  const verbs = [['check', ['check', ...inputs]]];
  const out = mkdtempSync(join(tmpdir(), 'fence-profile-'));
  if (withRender) verbs.push(['render', ['render', ...inputs, '--out', out]]);
  for (const [verb, cliArgs] of verbs) {
    // 終了コードは見ない (読めない行があれば 1 が返る。測りたいのは時間)。
    const result = timed('node', [cli, ...cliArgs], process.cwd());
    rows.push({ fence: short, verb, seconds: result.seconds, megabytes: result.megabytes });
    console.error(`${short} ${verb}: ${result.seconds} s, ${result.megabytes} MB`);
  }
  rmSync(out, { recursive: true, force: true });
}
console.log(table(['フェンス', '命令', '時間 (s)', '最大のメモリ (MB)'], rows.map((row) => [row.fence, row.verb, round(row.seconds, 1), row.megabytes])));
console.log(`\n合計 ${round(rows.reduce((sum, row) => sum + (row.seconds ?? 0), 0), 1)} s`);
console.error(`→ ${save('cli', { when: new Date().toISOString(), target, rows })}`);
