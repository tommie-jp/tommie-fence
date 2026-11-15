// 図を描く計測 (render.mjs・memory.mjs) の共通部分: 9 つのコアを読み、Markdown からフェンスを集める。
// ソースの .ts をそのまま読むので、呼ぶ側は `node --experimental-transform-types` で走らせる。
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { ROOT } from './lib.mjs';

export const PACKAGES = ['breadboard', 'perfboard', 'circuit', 'copper', 'vna', 'scope', 'spectrum', 'graph', 'logic'];

const core = (name) => import(new URL(`packages/${name}-fence/src/core/index.ts`, ROOT).href);

/**
 * フェンスごとの「取り出す」と「描く」。回路図は TeX を書き出すまで。`onLoaded(パッケージ名)` は 1 つ読むたびに呼ぶ
 * (読み込みのメモリを段ごとに測るため)。
 */
export async function loadFences({ only = null, onLoaded = () => {} } = {}) {
  const mods = {};
  for (const name of PACKAGES) {
    mods[name] = await core(name);
    onLoaded(name);
  }
  const { breadboard: bread, perfboard: perf, circuit, copper, vna, scope, spectrum, graph, logic } = mods;
  return [
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
}

const SKIPPED = new Set(['node_modules', 'out', 'dist', '.git']);

export const markdownFiles = (target) => (statSync(target).isDirectory()
  ? readdirSync(target, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap((entry) => {
    if (entry.isDirectory()) return SKIPPED.has(entry.name) || entry.name.startsWith('.') ? [] : markdownFiles(join(target, entry.name));
    return entry.name.endsWith('.md') ? [join(target, entry.name)] : [];
  })
  : [target]);

/** 対象 (ファイルかディレクトリ) の Markdown からフェンスを全部取り出す。`{ fence, file, line, source }` の並び。 */
export function collectJobs(targets, fences) {
  const jobs = [];
  for (const file of targets.flatMap((target) => markdownFiles(resolve(target)))) {
    const text = readFileSync(file, 'utf8');
    for (const fence of fences) {
      for (const block of fence.extract(text)) jobs.push({ fence, file: relative(process.cwd(), file), line: block.line, source: block.source });
    }
  }
  return jobs;
}

/** 本文を 1 字変える (読み取りの控え rememberRecent を外す)。末尾のコメントは図を変えない。 */
export const fresh = (source, tag) => `${source}\n# profile ${tag}\n`;
