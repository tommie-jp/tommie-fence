// マップのエディタの殻の関数 1 回の時間を測る (52 の docs/162 の段 5。docs/27 の測り方を今の版で)。
//
//   npm run profile:editor -- <ファイルかディレクトリ…> [--runs=50]
//
// フェンスごとに一番大きい図を 3 つ選び、殻 (`FenceEditor`) の view・problems を測る。**同じ本文で繰り返す**ので、
// 読み取りの控えが当たる (マップの試し当ては同じ本文を何度も読む)。本文を毎回変えた値も並べる。
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { ROOT, round, save, summarize, table } from './lib.mjs';

const args = process.argv.slice(2);
const targets = args.filter((arg) => !arg.startsWith('--'));
const runs = Number(args.find((arg) => arg.startsWith('--runs='))?.slice(7) ?? 50);
if (targets.length === 0) {
  console.error('使い方: npm run profile:editor -- <ファイルかディレクトリ…> [--runs=50]');
  process.exit(2);
}
const core = (name) => import(new URL(`packages/${name}-fence/src/core/index.ts`, ROOT).href);
const [bread, perf, circuit, copper] = await Promise.all(['breadboard', 'perfboard', 'circuit', 'copper'].map(core));
const EDITORS = [
  { name: 'bread', extract: bread.extractBreadboardFences, editor: bread.createBreadboardEditor() },
  { name: 'perf', extract: perf.extractPerfboardFences, editor: perf.createPerfboardEditor() },
  { name: 'circuit', extract: circuit.extractCircuitFences, editor: circuit.createCircuitEditor() },
  { name: 'copper', extract: copper.extractCopperFences, editor: copper.createCopperEditor() },
];

const SKIPPED = new Set(['node_modules', 'out', 'dist', '.git']);
const files = (target) => (statSync(target).isDirectory()
  ? readdirSync(target, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap((entry) => {
    if (entry.isDirectory()) return SKIPPED.has(entry.name) || entry.name.startsWith('.') ? [] : files(join(target, entry.name));
    return entry.name.endsWith('.md') ? [join(target, entry.name)] : [];
  })
  : [target]);
const markdown = targets.flatMap((target) => files(resolve(target))).map((file) => [relative(process.cwd(), file), readFileSync(file, 'utf8')]);

const measure = (fn) => {
  for (let index = 0; index < 5; index += 1) fn(-1 - index);
  const samples = [];
  for (let index = 0; index < runs; index += 1) {
    const started = performance.now();
    fn(index);
    samples.push(performance.now() - started);
  }
  return summarize(samples);
};

const rows = [];
for (const one of EDITORS) {
  const blocks = markdown.flatMap(([file, text]) => one.extract(text).map((block) => ({ where: `${file}:${block.line}`, source: block.source })));
  for (const block of blocks.sort((a, b) => b.source.length - a.source.length).slice(0, 3)) {
    const fresh = (index) => `${block.source}\n# profile ${index}\n`;
    rows.push({
      fence: one.name, where: block.where, bytes: block.source.length,
      view: measure(() => one.editor.view(block.source, 0)),
      viewFresh: measure((index) => one.editor.view(fresh(index), 0)),
      problems: one.editor.problems === undefined ? null : measure(() => one.editor.problems(block.source, 0, { erc: false })),
      erc: one.editor.problems === undefined ? null : measure(() => one.editor.problems(block.source, 0, { erc: true })),
    });
  }
}
const cell = (summary) => (summary === null ? '—' : `${round(summary.median)} / ${round(summary.p95)}`);
console.log(`殻の関数 1 回の時間 (ms、中央値 / 95 %。${runs} 回)\n`);
console.log(table(['フェンス', 'どこ', '本文 (バイト)', 'view (同じ本文)', 'view (本文を変えて)', 'problems', 'problems (ERC つき)'],
  rows.map((row) => [row.fence, row.where, row.bytes, cell(row.view), cell(row.viewFresh), cell(row.problems), cell(row.erc)])));
console.error(`→ ${save('editor', { when: new Date().toISOString(), runs, rows })}`);
