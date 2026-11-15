// 回路図の TeX → SVG の時間を測る (52 の docs/162。WASM の TeX は 1 枚が秒の桁で、ほかの段と桁が違う)。
//
//   npm run profile:tex -- <ファイルかディレクトリ…> [--count=8]
//
// 初回 (WASM とフォントの読み込みを含む) と 2 枚め以降を分けて出す。図は大きさの順に並べ、等間隔に --count 枚を選ぶ。
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { ROOT, round, save, summarize, table } from './lib.mjs';

const args = process.argv.slice(2);
const targets = args.filter((arg) => !arg.startsWith('--'));
const count = Number(args.find((arg) => arg.startsWith('--count='))?.slice(8) ?? 8);
if (targets.length === 0) {
  console.error('使い方: npm run profile:tex -- <ファイルかディレクトリ…> [--count=8]');
  process.exit(2);
}
const circuit = await import(new URL('packages/circuit-fence/src/core/index.ts', ROOT).href);
const { renderTex } = await import(new URL('packages/circuit-fence/src/host/texSvg.ts', ROOT).href);

const SKIPPED = new Set(['node_modules', 'out', 'dist', '.git']);
const files = (target) => (statSync(target).isDirectory()
  ? readdirSync(target, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap((entry) => {
    if (entry.isDirectory()) return SKIPPED.has(entry.name) || entry.name.startsWith('.') ? [] : files(join(target, entry.name));
    return entry.name.endsWith('.md') ? [join(target, entry.name)] : [];
  })
  : [target]);

const all = [];
for (const file of targets.flatMap((target) => files(resolve(target)))) {
  for (const block of circuit.extractCircuitFences(readFileSync(file, 'utf8'))) {
    const started = performance.now();
    const { tex } = circuit.compileCircuit(block.source);
    if (tex !== null) all.push({ where: `${relative(process.cwd(), file)}:${block.line}`, tex, compileMs: performance.now() - started });
  }
}
all.sort((a, b) => a.tex.length - b.tex.length);
const step = Math.max(1, Math.floor(all.length / count));
const picked = all.filter((_, index) => index % step === 0).slice(0, count);
console.error(`回路図 ${all.length} 枚のうち ${picked.length} 枚を描く`);

const rows = [];
for (const [index, one] of picked.entries()) {
  const started = performance.now();
  const outcome = await renderTex(one.tex);
  const ms = performance.now() - started;
  rows.push({ where: one.where, texBytes: one.tex.length, compileMs: one.compileMs, ms, ok: outcome.ok, svgBytes: outcome.ok ? outcome.svg.length : 0, first: index === 0 });
  console.error(`${one.where}: ${round(ms, 0)} ms`);
}
const rest = rows.filter((row) => !row.first).map((row) => row.ms);
console.log(table(['どこ', 'TeX (KB)', 'TeX を書き出す (ms)', 'TeX → SVG (ms)', 'SVG (KB)'],
  rows.map((row) => [`${row.where}${row.first ? ' (初回)' : ''}`, round(row.texBytes / 1024, 1), round(row.compileMs), round(row.ms, 0), round(row.svgBytes / 1024, 0)])));
if (rest.length > 0) {
  const s = summarize(rest);
  console.log(`\n初回 ${round(rows[0].ms, 0)} ms (WASM とフォントの読み込みを含む)。2 枚め以降: 中央値 ${round(s.median, 0)} ms、最小 ${round(s.min, 0)} ms、最大 ${round(s.max, 0)} ms`);
}
console.log(`プロセスの最大メモリ (RSS): ${round(process.resourceUsage().maxRSS / 1024, 0)} MB`);
console.error(`→ ${save('tex', { when: new Date().toISOString(), rows })}`);
