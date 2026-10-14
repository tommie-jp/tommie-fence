#!/usr/bin/env node
// 例の `.md` の各フェンスの 1 行目に、何のフェンスかを書く名札のコメントを置く。
//
//   node scripts/fence-labels.mjs           書き直す
//   node scripts/fence-labels.mjs --check   古い・無い所を言って 1 で終わる
//
// なぜ要るか: GitHub は Markdown のコードブロックに言語名を出さない。例の `.md` を
// GitHub で読むと、図の下の字が何のフェンスの字か分からない。字の側に
// `# 回路図 (tommie-fence の circuit フェンス)` と書いておく。YAML のコメントなので
// 図にもプレビューにも出ない。**この行はこの道具が書く。手で直さない。**
// (教科書 tommie-circuit-workbook の scripts/figures.mjs と同じ文言・同じ仕組み)
//
// 対象は `packages/*/examples/*.md`・`packages/*/docs/*.md`・`examples/*.md`。
// (docs の図の題が examples と同じなら、中身も同じでなければならない試験がある。)`errors/` は外す —
// 壊れた書き方を行番号つきで見せる例なので、1 行足すと数えが動く。

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const LABELS = {
  circuit: '回路図',
  breadboard: 'ブレッドボードの実体配線図',
  bread: 'ブレッドボードの実体配線図',
  perfboard: 'ユニバーサル基板の実体配線図',
  perf: 'ユニバーサル基板の実体配線図',
  copper: '銅張り基板の寸法図',
  vna: 'NanoVNA の画面',
  scope: 'オシロスコープの画面',
  spectrum: 'スペクトラムアナライザの画面',
  graph: 'グラフ',
  logic: 'ロジックアナライザの画面',
};

const LABEL_LINE = /^ *# .+ \(tommie-fence の \S+ フェンス\)$/;
const OPEN = /^( {0,3})(`{3,}|~{3,}) *([^\s`]+)/;

/** 名札を書き直した本文。書いてあるものは消してから、図になるフェンスの開きの直後に置き直す。 */
export function withLabels(text) {
  const lines = text.split('\n').filter((line) => !LABEL_LINE.test(line));
  const out = [];
  let fence = null; // { char, length, labelled }
  for (const line of lines) {
    if (fence === null) {
      const open = OPEN.exec(line);
      out.push(line);
      if (open !== null) {
        fence = { char: open[2][0], length: open[2].length };
        const name = open[3];
        if (Object.hasOwn(LABELS, name)) out.push(`${open[1]}# ${LABELS[name]} (tommie-fence の ${name} フェンス)`);
      }
    } else {
      const close = new RegExp(`^ {0,3}\\${fence.char}{${fence.length},} *$`).test(line);
      out.push(line);
      if (close) fence = null;
    }
  }
  return out.join('\n');
}

/** 対象の .md (リポジトリ直下からの相対パス)。 */
export function targets(root) {
  const dirs = [
    'examples',
    ...readdirSync(join(root, 'packages')).flatMap((name) => [`packages/${name}/examples`, `packages/${name}/docs`]),
  ];
  return dirs
    .filter((dir) => existsSync(join(root, dir)))
    .flatMap((dir) => readdirSync(join(root, dir)).filter((name) => name.endsWith('.md')).map((name) => `${dir}/${name}`))
    .sort();
}

function main(args) {
  const root = join(import.meta.dirname, '..');
  const stale = [];
  for (const path of targets(root)) {
    const text = readFileSync(join(root, path), 'utf8');
    const next = withLabels(text);
    if (next === text) continue;
    stale.push(path);
    if (!args.includes('--check')) writeFileSync(join(root, path), next);
  }
  if (args.includes('--check')) {
    if (stale.length > 0) {
      console.error(`フェンスの名札が古い・無い: ${stale.join(', ')} (npm run labels で書き直す)`);
      process.exit(1);
    }
    return;
  }
  console.log(`${stale.length} 件の例の名札を書き直した`);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) main(process.argv.slice(2));
