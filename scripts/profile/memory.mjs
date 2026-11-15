// 図を描くときのメモリを測る (52 の docs/162)。
//
//   npm run profile:memory -- <ファイルかディレクトリ…>          例: packages/breadboard-fence/examples
//   npm run profile:memory -- ../tommie-circuit-workbook/01-circuits --rounds=3
//   npm run profile:memory -- <…> --only=bread,scope            フェンスを選ぶ
//
// 出す物は 4 つ:
//   1. 段ごとのメモリ (GC のあと) — 起動・9 つのコアを 1 つずつ読む・Markdown を読む・全部を 1 回描く
//      → 常に残る量。読み込みでどのコアが重いか、描いたあとに控えがどれだけ残るか
//   2. フェンスごとの割り当て — フェンスごとに V8 の割り当てのサンプリングを分けて取る (GC で回収される一時的な物も含む)
//      → 1 図あたりどれだけ作っては捨てているか (GC の負担)。描いたあとに残った量も並べる
//   3. 割り当ての多い関数とファイル — 全部のフェンスを --rounds 巡したときのサンプリング
//   4. ヒープの空間ごとの大きさと、プロセスの最大 RSS
//
// - 毎回 1 字違う本文で描く (読み取りの控えを外す。render.mjs と同じ)
// - サンプリングは 16 KB ごとの抜き取りなので、数は目安 (同じ条件で比べる物)
// - 回路図は TeX を書き出すまで。TeX → SVG (別のプロセス) のメモリは profile:tex / profile:cli で見る
// - `node --expose-gc` で走らせる (GC のあとの量を測るため)。package.json の profile:memory が付ける
//
// 本体には手を入れない。外から入口の関数を呼ぶだけ。
import { Session } from 'node:inspector/promises';
import { fileURLToPath } from 'node:url';
import v8 from 'node:v8';
import { collectJobs, fresh, loadFences } from './fences.mjs';
import { ROOT, round, save, table } from './lib.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const targets = args.filter((arg) => !arg.startsWith('--'));
const rounds = Number(option('rounds', 3));
const only = option('only', null)?.split(',') ?? null;
const top = Number(option('top', 15));
if (targets.length === 0) {
  console.error('使い方: npm run profile:memory -- <ファイルかディレクトリ…> [--rounds=3] [--only=bread,scope] [--top=15]');
  process.exit(2);
}
if (typeof globalThis.gc !== 'function') {
  console.error('node --expose-gc で走らせてください (npm run profile:memory が付けます)');
  process.exit(2);
}

/** 1 回の抜き取りの間隔 (バイト)。小さいほど正確で遅い。 */
const SAMPLING_INTERVAL = 16 * 1024;
const MB = 1024 * 1024;
const mb = (bytes) => round(bytes / MB, 1);

// ---- 1. 段ごとのメモリ -------------------------------------------------------

const stages = [];
const snapshot = (label) => {
  globalThis.gc();
  globalThis.gc();
  const { heapUsed, heapTotal, external, rss } = process.memoryUsage();
  stages.push({ label, heapUsed, heapTotal, external, rss });
};

snapshot('起動した直後');
const FENCES = await loadFences({ only, onLoaded: (name) => snapshot(`${name}-fence を読み込んだ後`) });
const jobs = collectJobs(targets, FENCES);
if (jobs.length === 0) {
  console.error('フェンスが 1 つもありません');
  process.exit(1);
}
snapshot(`Markdown を読んだ後 (${jobs.length} 図)`);
for (const job of jobs) job.fence.draw(fresh(job.source, 'once'));
snapshot('全部の図を 1 回描いた後');

console.error(`フェンス ${jobs.length} 個 (${FENCES.map((fence) => `${fence.name} ${jobs.filter((job) => job.fence === fence).length}`).join(' / ')})、${rounds} 巡`);
console.log('### 段ごとのメモリ (GC のあと。MB)\n');
console.log(table(['段', 'heapUsed', 'heapTotal', 'external', 'RSS'],
  stages.map((stage) => [stage.label, mb(stage.heapUsed), mb(stage.heapTotal), mb(stage.external), mb(stage.rss)])));

// ---- 2. フェンスごとの割り当て ---------------------------------------------

const session = new Session();
session.connect();
await session.post('HeapProfiler.enable');

/** `draw()` を回す間の割り当てを抜き取る。GC で回収された物も数える (作っては捨てる量を見るため)。 */
async function sampled(draw) {
  await session.post('HeapProfiler.startSampling', {
    samplingInterval: SAMPLING_INTERVAL, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true,
  });
  draw();
  const { profile } = await session.post('HeapProfiler.stopSampling');
  return profile;
}

const totalOf = (node) => node.selfSize + node.children.reduce((sum, child) => sum + totalOf(child), 0);

const byFence = [];
for (const fence of FENCES) {
  const own = jobs.filter((job) => job.fence === fence);
  if (own.length === 0) continue;
  globalThis.gc();
  const before = process.memoryUsage().heapUsed;
  const profile = await sampled(() => {
    for (let index = 0; index < rounds; index += 1) for (const job of own) fence.draw(fresh(job.source, `fence ${index}`));
  });
  globalThis.gc();
  const allocated = totalOf(profile.head);
  byFence.push({ name: fence.name, count: own.length, allocated, perFigure: allocated / rounds / own.length, retained: process.memoryUsage().heapUsed - before });
}

console.log(`\n### フェンスごとの割り当て (${rounds} 巡。GC で回収される一時的な物も含む。抜き取りなので目安)\n`);
console.log(table(['フェンス', '図', '割り当ての計 (MB)', '1 図あたり (KB)', '描いた後に残った量 (MB)'],
  [...byFence].sort((a, b) => b.perFigure - a.perFigure).map((one) =>
    [one.name, one.count, mb(one.allocated), round(one.perFigure / 1024, 0), mb(one.retained)])));
console.log('\n残った量の小さな揺れ (マイナスを含む) は GC の時機による。数 MB 以上残るのは読み取りや部品の控え');

// ---- 3. 割り当ての多い関数とファイル ---------------------------------------

const profile = await sampled(() => {
  for (let index = 0; index < rounds; index += 1) for (const job of jobs) job.fence.draw(fresh(job.source, `all ${index}`));
});
session.disconnect();

const rootPath = fileURLToPath(ROOT);
const where = (url) => {
  if (url === '') return '(V8・組み込み)';
  const path = url.startsWith('file://') ? fileURLToPath(url) : url;
  if (path.includes('/node_modules/')) return `node_modules/${/node_modules\/((?:@[^/]+\/)?[^/]+)/.exec(path)[1]}`;
  return path.startsWith(rootPath) ? path.slice(rootPath.length).replace(/^packages\//, '') : path;
};
const functions = new Map();
const files = new Map();
let total = 0;
const walk = (node) => {
  const bytes = node.selfSize;
  total += bytes;
  if (bytes > 0) {
    const { functionName, url, lineNumber } = node.callFrame;
    const file = where(url);
    const line = url !== '' && !file.startsWith('node_modules/') && lineNumber >= 0 ? `:${lineNumber + 1}` : '';
    const name = `${functionName || '(名前なし)'} — ${file}${line}`;
    functions.set(name, (functions.get(name) ?? 0) + bytes);
    files.set(file, (files.get(file) ?? 0) + bytes);
  }
  for (const child of node.children) walk(child);
};
walk(profile.head);
const ranked = (map) => [...map].sort((a, b) => b[1] - a[1]).slice(0, top).map(([name, bytes]) => [name, mb(bytes), `${round((bytes / total) * 100, 1)} %`]);
const allocation = { totalMb: total / MB, rounds, functions: ranked(functions), files: ranked(files) };

console.log(`\n### 割り当ての多い関数 (全部の図を ${rounds} 巡、計 ${mb(total)} MB。抜き取りなので目安)\n`);
console.log(table(['関数 — ファイル:行', 'MB', '割合'], allocation.functions));
console.log('\n### 割り当ての多いファイル\n');
console.log(table(['ファイル', 'MB', '割合'], allocation.files));

// ---- 4. ヒープの空間と最大 RSS -----------------------------------------------

globalThis.gc();
const spaces = v8.getHeapSpaceStatistics().filter((space) => space.space_used_size > 512 * 1024)
  .map((space) => ({ name: space.space_name, used: space.space_used_size, size: space.space_size }));
const maxRss = process.resourceUsage().maxRSS * 1024;
console.log('\n### ヒープの空間ごとの大きさ (全部を描いて GC した後。MB)\n');
console.log(table(['空間', '使っている', '確保している'], spaces.map((space) => [space.name, mb(space.used), mb(space.size)])));
console.log(`\nプロセスの最大 RSS: ${mb(maxRss)} MB (抜き取りの道具の分を含む)`);

const saved = save('memory', {
  targets, figures: jobs.length, rounds,
  stages: stages.map((stage) => ({ ...stage, heapUsed: stage.heapUsed / MB, heapTotal: stage.heapTotal / MB, external: stage.external / MB, rss: stage.rss / MB })),
  fences: byFence.map((one) => ({ ...one, allocated: one.allocated / MB, perFigure: one.perFigure / 1024, retained: one.retained / MB })),
  allocation, spaces: spaces.map((space) => ({ ...space, used: space.used / MB, size: space.size / MB })), maxRssMb: maxRss / MB,
});
console.error(`\n結果: ${saved} (MB と KB の単位)`);
