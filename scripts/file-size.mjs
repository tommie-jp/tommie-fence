#!/usr/bin/env node
// ソースのファイルの行数を見張る (52 の docs/164)。
//
//   node scripts/file-size.mjs           上限を越えたファイルと、表の古い所を言って 1 で終わる
//
// 1 ファイルは 800 行まで (試験と生成物は数えない)。越えているファイルは下の表に**今の行数を上限として**載せ、
// **それ以上は大きくしない** (ラチェット)。表のファイルに足すときは、先に割ってから足す。
// まとめて割らないのは、図の出方が少しずつ変わる回帰の危険が大きいため。触るついでに 1 つずつ割る。
//
// - 表のファイルが 800 行以下になったら、表から外す (外さないと落ちる。表を正直に保つ)
// - 表のファイルが縮んだら、上限も下げてよい (下げなくても落ちない)
// - 上限を上げるのは、割れない理由があるときだけ。理由を行の横に書く
// node と git だけで動く (CI では npm ci の前に走る)。

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const LIMIT = 800;

/** 800 行を越えたまま残っているファイルと、その上限 (2026-11-16 の行数)。 */
export const OVERSIZED = {
  'packages/circuit-fence/src/core/parts.ts': 1959,
  'packages/fence-kit/src/editor/webview/map.ts': 1943,
  'packages/fence-kit/src/editor/session.ts': 1806,
  'packages/circuit-fence/src/core/tex/generate.ts': 1327,
  'packages/circuit-fence/src/core/edit/mapSvg.ts': 1170,
  'packages/fence-kit/src/parts/chips.ts': 1110,
  'packages/fence-kit/src/parts/bodies.ts': 1060,
  'packages/fence-kit/src/editor/webview/mapState.ts': 1042,
  'packages/perfboard-fence/src/core/render/parts.ts': 977,
  'packages/breadboard-fence/src/core/index.ts': 975,
  'packages/fence-kit/src/editor/panelHtml.ts': 974,
  'packages/breadboard-fence/src/core/router/route.ts': 911,
  'packages/circuit-fence/src/core/parser/compact.ts': 835,
};

/** 数えるファイル: パッケージのソースと、リポジトリの道具。試験と生成物 (`*.gen.ts`) は外す。 */
export const counted = (path) => /^(?:packages\/[^/]+\/(?:src|scripts)\/.+|scripts\/.+)\.(?:ts|mts|mjs|js)$/.test(path)
  && !/\.test\.[a-z]+$/.test(path) && !/\.gen\.ts$/.test(path);

const lineCount = (text) => (text.length === 0 ? 0 : text.split('\n').length - (text.endsWith('\n') ? 1 : 0));

/** 行数の一覧から問題を並べる。 */
export function problemsOf(lines, oversized = OVERSIZED) {
  const problems = [];
  for (const [path, count] of lines) {
    const cap = oversized[path];
    if (cap === undefined && count > LIMIT) problems.push(`${path}: ${count} 行 (上限 ${LIMIT})。割る`);
    else if (cap !== undefined && count > cap) problems.push(`${path}: ${count} 行 (この表の上限 ${cap})。大きくしない — 先に割ってから足す`);
    else if (cap !== undefined && count <= LIMIT) problems.push(`${path}: ${count} 行になった。scripts/file-size.mjs の表から外す`);
  }
  const present = new Set(lines.map(([path]) => path));
  for (const path of Object.keys(oversized)) {
    if (!present.has(path)) problems.push(`${path}: 無くなった。scripts/file-size.mjs の表から外す`);
  }
  return problems;
}

function main() {
  const root = new URL('../', import.meta.url).pathname;
  const files = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(counted);
  const lines = files.map((path) => [path, lineCount(readFileSync(join(root, path), 'utf8'))]);
  const problems = problemsOf(lines);
  if (problems.length === 0) return;
  console.error(problems.join('\n'));
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
