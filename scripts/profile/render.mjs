// 図を描く時間・関数・ヒープを測る (52 の docs/162 の段 3・4)。
//
//   npm run profile:render -- <ファイルかディレクトリ…>          例: packages/breadboard-fence/examples
//   npm run profile:render -- ../tommie-circuit-workbook/01-circuits --runs=30
//   npm run profile:render -- <…> --only=bread,perf             フェンスを選ぶ
//   npm run profile:render -- <…> --no-cpu                      関数の計測を飛ばす
//
// - Markdown からフェンスを取り出し、フェンス 1 つを **暖めてから --runs 回**描いて中央値と 95 パーセンタイルを出す
//   (時間は 1 回の値で判断しない)
// - 回路図は TeX を書き出すまで (`compileCircuit`)。TeX を SVG にする時間は別物なので `tex.mjs` で測る
// - 関数の上位は V8 の CPU プロファイラ (inspector) で取り、関数とファイルにまとめる。**ソースの .ts をそのまま読む**ので
//   (`node --experimental-transform-types`)、束ねた 1 本ではなくファイルの単位で出る
// - ヒープは、全部のフェンスを何巡も描いて GC したあとの大きさを並べる (増え続ければ漏れ)
//
// 本体には手を入れない。外から入口の関数を呼ぶだけ。
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { Session } from 'node:inspector/promises';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, round, save, summarize, table } from './lib.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const targets = args.filter((arg) => !arg.startsWith('--'));
const runs = Number(option('runs', 30));
const rounds = Number(option('rounds', 12));
const only = option('only', null)?.split(',') ?? null;
const top = Number(option('top', 20));
const wantCpu = !args.includes('--no-cpu');
if (targets.length === 0) {
  console.error('使い方: npm run profile:render -- <ファイルかディレクトリ…> [--runs=30] [--only=bread,perf] [--no-cpu]');
  process.exit(2);
}

const core = (name) => import(new URL(`packages/${name}-fence/src/core/index.ts`, ROOT).href);
const [bread, perf, circuit, copper, vna, scope, spectrum, graph, logic] = await Promise.all(
  ['breadboard', 'perfboard', 'circuit', 'copper', 'vna', 'scope', 'spectrum', 'graph', 'logic'].map(core),
);

/** フェンスごとの「取り出す」と「描く」。回路図は TeX を書き出すまで。 */
const FENCES = [
  { name: 'bread', extract: bread.extractBreadboardFences, draw: (source) => bread.renderBreadboard(source) },
  { name: 'perf', extract: perf.extractPerfboardFences, draw: (source) => perf.renderPerfboard(source) },
  { name: 'circuit', extract: circuit.extractCircuitFences, draw: (source) => circuit.compileCircuit(source) },
  { name: 'copper', extract: copper.extractCopperFences, draw: (source) => copper.renderCopper(source) },
  { name: 'vna', extract: vna.extractVnaFences, draw: (source) => vna.renderVna(source) },
  { name: 'scope', extract: scope.extractScopeFences, draw: (source) => scope.renderScope(source) },
  { name: 'spectrum', extract: spectrum.extractSpectrumFences, draw: (source) => spectrum.renderSpectrum(source) },
  { name: 'graph', extract: graph.extractGraphFences, draw: (source) => graph.renderGraph(source) },
  { name: 'logic', extract: logic.extractLogicFences, draw: (source) => logic.renderLogic(source) },
].filter((fence) => only === null || only.includes(fence.name));

const SKIPPED = new Set(['node_modules', 'out', 'dist', '.git']);
const markdownFiles = (target) => (statSync(target).isDirectory()
  ? readdirSync(target, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap((entry) => {
    if (entry.isDirectory()) return SKIPPED.has(entry.name) || entry.name.startsWith('.') ? [] : markdownFiles(join(target, entry.name));
    return entry.name.endsWith('.md') ? [join(target, entry.name)] : [];
  })
  : [target]);

/** 大きさの目安: `parts:` と `wires:` の下の行の数 (読み取りに頼らず字で数える)。 */
function sizeOf(source) {
  let section = null;
  let count = 0;
  for (const line of source.split('\n')) {
    const key = /^([a-z]+):/.exec(line)?.[1];
    if (key !== undefined) section = key;
    else if ((section === 'parts' || section === 'wires') && /^\s+\S/.test(line) && !/^\s+#/.test(line)) count += 1;
  }
  return count;
}

const jobs = [];
for (const file of targets.flatMap((target) => markdownFiles(resolve(target)))) {
  const text = readFileSync(file, 'utf8');
  for (const fence of FENCES) {
    for (const block of fence.extract(text)) {
      jobs.push({ fence, file: relative(process.cwd(), file), line: block.line, source: block.source, size: sizeOf(block.source), bytes: block.source.length });
    }
  }
}
if (jobs.length === 0) {
  console.error('フェンスが 1 つもありません');
  process.exit(1);
}
console.error(`フェンス ${jobs.length} 個 (${FENCES.map((fence) => `${fence.name} ${jobs.filter((job) => job.fence === fence).length}`).join(' / ')})、${runs} 回ずつ`);

// ---- 1. フェンスごとの時間 -------------------------------------------------

const WARMUP = 5;
for (const job of jobs) {
  // 同じ本文を続けて読むと読み取りの控え (rememberRecent) が当たる。**毎回 1 字違う本文**にして、控え無しの時間を測る
  // (プレビューは打鍵のたびに本文が変わるので、こちらが実際に近い)。末尾のコメントは図を変えない。
  const fresh = (index) => `${job.source}\n# profile ${index}\n`;
  for (let index = 0; index < WARMUP; index += 1) job.fence.draw(fresh(-1 - index));
  const samples = [];
  let output = 0;
  for (let index = 0; index < runs; index += 1) {
    const started = performance.now();
    const result = job.fence.draw(fresh(index));
    samples.push(performance.now() - started);
    output = (result.svg ?? result.tex ?? '').length;
  }
  // 控えが当たるとき (マップの試し当ては同じ本文を何度も読む)。
  const cached = [];
  for (let index = 0; index < runs; index += 1) {
    const started = performance.now();
    job.fence.draw(job.source);
    cached.push(performance.now() - started);
  }
  job.time = summarize(samples);
  job.cached = summarize(cached);
  job.output = output;
}

const byFence = FENCES.map((fence) => {
  const own = jobs.filter((job) => job.fence === fence);
  if (own.length === 0) return null;
  const medians = own.map((job) => job.time.median);
  const sum = medians.reduce((total, value) => total + value, 0);
  const sizes = own.reduce((total, job) => total + job.size, 0);
  return {
    name: fence.name, count: own.length, total: sum, ...summarize(medians),
    perItem: sizes === 0 ? null : sum / sizes,
    outputKb: own.reduce((total, job) => total + job.output, 0) / own.length / 1024,
    maxOutputKb: Math.max(...own.map((job) => job.output)) / 1024,
    cachedMedian: summarize(own.map((job) => job.cached.median)).median,
  };
}).filter(Boolean);

console.log('### フェンスごとの時間 (1 つ描く時間の中央値を、フェンスの中でまとめた物。ms)\n');
console.log(table(['フェンス', '個数', '中央値', '95 %', '最大', '全部を 1 回 (ms)', '部品・線 1 行あたり', '控えが当たるとき', '出力の平均 (KB)', '出力の最大 (KB)'],
  byFence.map((one) => [one.name, one.count, round(one.median), round(one.p95), round(one.max), round(one.total, 0), round(one.perItem, 3), round(one.cachedMedian, 3), round(one.outputKb, 0), round(one.maxOutputKb, 0)])));

console.log(`\n### 遅いフェンスの上位 ${Math.min(top, jobs.length)}\n`);
console.log(table(['フェンス', 'どこ', '部品・線の行', '中央値 (ms)', '95 % (ms)', '1 行あたり (ms)', '出力 (KB)'],
  [...jobs].sort((a, b) => b.time.median - a.time.median).slice(0, top).map((job) =>
    [job.fence.name, `${job.file}:${job.line}`, job.size, round(job.time.median), round(job.time.p95), round(job.size === 0 ? null : job.time.median / job.size, 3), round(job.output / 1024, 0)])));

// 大きさとの伸び方: 部品・線の行の数で 4 つに分け、1 行あたりの時間が大きい組ほど伸びていないかを見る。
console.log('\n### 大きさとの伸び方 (部品・線の行の数で 4 つに分けた、1 行あたりの時間。大きい組で増えていれば伸び方が線形でない)\n');
const scaling = [];
for (const one of byFence) {
  const own = jobs.filter((job) => job.fence.name === one.name && job.size > 0).sort((a, b) => a.size - b.size);
  if (own.length < 8) continue;
  const quarter = Math.ceil(own.length / 4);
  const groups = [0, 1, 2, 3].map((index) => own.slice(index * quarter, (index + 1) * quarter)).filter((group) => group.length > 0);
  scaling.push([one.name, ...groups.map((group) => {
    const perItem = summarize(group.map((job) => job.time.median / job.size)).median;
    return `${group[0].size}〜${group[group.length - 1].size} 行: ${round(perItem, 3)}`;
  })]);
}
console.log(scaling.length === 0 ? '(どのフェンスも 8 個に満たないので出さない)' : table(['フェンス', '小', '中の小', '中の大', '大'], scaling.map((row) => [...row, '—', '—', '—'].slice(0, 5))));

// ---- 2. 関数とファイルの上位 (CPU プロファイル) ----------------------------

let cpu = null;
if (wantCpu) {
  const session = new Session();
  session.connect();
  await session.post('Profiler.enable');
  await session.post('Profiler.setSamplingInterval', { interval: 200 });
  await session.post('Profiler.start');
  const cpuRounds = Math.max(3, Math.ceil(runs / 3));
  for (let round_ = 0; round_ < cpuRounds; round_ += 1) for (const job of jobs) job.fence.draw(`${job.source}\n# cpu ${round_}\n`);
  const { profile } = await session.post('Profiler.stop');
  session.disconnect();

  const rootPath = fileURLToPath(ROOT);
  const where = (url) => {
    if (url === '') return '(V8・GC・組み込み)';
    const path = url.startsWith('file://') ? fileURLToPath(url) : url;
    if (path.includes('/node_modules/')) return `node_modules/${/node_modules\/((?:@[^/]+\/)?[^/]+)/.exec(path)[1]}`;
    return path.startsWith(rootPath) ? path.slice(rootPath.length).replace(/^packages\//, '') : path;
  };
  const selfOf = new Map(profile.nodes.map((node) => [node.id, 0]));
  const deltas = profile.timeDeltas ?? [];
  profile.samples.forEach((id, index) => selfOf.set(id, (selfOf.get(id) ?? 0) + (deltas[index] ?? 0)));
  const total = [...selfOf.values()].reduce((sum, value) => sum + value, 0);
  const functions = new Map();
  const files = new Map();
  for (const node of profile.nodes) {
    const micros = selfOf.get(node.id) ?? 0;
    if (micros === 0) continue;
    const file = where(node.callFrame.url);
    const name = `${node.callFrame.functionName || '(名前なし)'} — ${file}${node.callFrame.lineNumber >= 0 && node.callFrame.url !== '' ? `:${node.callFrame.lineNumber + 1}` : ''}`;
    functions.set(name, (functions.get(name) ?? 0) + micros);
    files.set(file, (files.get(file) ?? 0) + micros);
  }
  const ranked = (map) => [...map].sort((a, b) => b[1] - a[1]).slice(0, top).map(([name, micros]) => [name, round(micros / 1000, 1), `${round((micros / total) * 100, 1)} %`]);
  cpu = { totalMs: total / 1000, rounds: cpuRounds, functions: ranked(functions), files: ranked(files) };
  console.log(`\n### 時間の掛かっている関数 (自分の中で使った時間。全部のフェンスを ${cpuRounds} 巡、計 ${round(total / 1000, 0)} ms)\n`);
  console.log(table(['関数 — ファイル:行', 'ms', '割合'], cpu.functions));
  console.log('\n### 時間の掛かっているファイル\n');
  console.log(table(['ファイル', 'ms', '割合'], cpu.files));
}

// ---- 3. ヒープ (漏れ) -------------------------------------------------------

let heap = null;
if (typeof globalThis.gc === 'function') {
  const used = () => {
    globalThis.gc();
    globalThis.gc();
    return process.memoryUsage().heapUsed / 1024 / 1024;
  };
  const before = used();
  const series = [];
  for (let index = 0; index < rounds; index += 1) {
    for (const job of jobs) job.fence.draw(`${job.source}\n# heap ${index}\n`);
    series.push(used());
  }
  // 後ろ半分の傾き (MB / 巡)。暖まったあとも増え続けていれば漏れ。
  const half = series.slice(Math.floor(series.length / 2));
  const slope = half.length < 2 ? 0 : (half[half.length - 1] - half[0]) / (half.length - 1);
  heap = { before, series, slopePerRound: slope, rss: process.memoryUsage().rss / 1024 / 1024 };
  console.log(`\n### ヒープ (全部のフェンスを ${rounds} 巡描き、巡ごとに GC したあとの大きさ)\n`);
  console.log(`描く前 ${round(before, 1)} MB → ${series.map((value) => round(value, 1)).join(' → ')} MB`);
  console.log(`後ろ半分の傾き: ${round(slope, 3)} MB / 巡 (0 に近ければ漏れていない)。プロセス全体 (RSS) ${round(heap.rss, 0)} MB`);
} else {
  console.log('\n(ヒープは測っていない。`--expose-gc` を付けて回すと測る。`npm run profile:render` は付けてある)');
}

const path = save('render', {
  when: new Date().toISOString(), targets, runs, byFence, cpu, heap,
  jobs: jobs.map((job) => ({ fence: job.fence.name, file: job.file, line: job.line, size: job.size, bytes: job.bytes, output: job.output, time: job.time, cached: job.cached })),
});
console.error(`→ ${path}`);
