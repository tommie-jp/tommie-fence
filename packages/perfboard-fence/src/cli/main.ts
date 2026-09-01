#!/usr/bin/env node
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import { outputStem } from 'fence-kit';
import { errorText, extractPerfboardFences, renderPerfboard } from '../core/index.ts';
import type { FenceError, Net } from '../core/index.ts';
import { USAGE, parseArgs } from './args.ts';

type Job = { readonly source: string; readonly outPath: string; readonly label: string };

const isYaml = (path: string): boolean => ['.yaml', '.yml'].includes(extname(path));
const isMarkdown = (path: string): boolean => ['.md', '.markdown'].includes(extname(path));

const reason = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * **ディレクトリは 1 段だけ見る。** `examples/errors/` のようにわざと読めなく
 * 書いた置き場を、`render examples` が巻き込まないため (48 / 49 と同じ作法)。
 *
 * 1 つも見つからない指定は**黙って通さない**。空のディレクトリを渡した CI が、
 * 何も検証しないまま緑になる。
 */
function collectFiles(target: string): string[] {
  const stats = statSync(target);
  if (!stats.isDirectory()) return [target];

  const found = readdirSync(target)
    .map((name) => join(target, name))
    .filter((path) => statSync(path).isFile() && (isYaml(path) || isMarkdown(path)))
    .sort();
  if (found.length === 0) {
    throw new Error(`${target} に .md も .yaml もありません (下の階層は見ません)`);
  }
  return found;
}

function jobsFor(path: string, outDir: string | null): Job[] {
  const stem = basename(path, extname(path));
  const directory = outDir ?? resolve(path, '..');
  const source = readFileSync(path, 'utf8');

  if (isYaml(path)) return [{ source, outPath: join(directory, `${stem}.svg`), label: stem }];

  const fences = extractPerfboardFences(source);
  // 名前の付け方は fence-kit にある (3 つのフェンスで同じもの。書き写さない)。
  return fences.map((fence, index) => ({
    source: fence.source,
    outPath: join(directory, `${outputStem(stem, index, fences.length)}.svg`),
    label: `${stem} (${fence.line} 行目)`,
  }));
}

function reportNetlist(netlist: readonly Net[]): void {
  if (netlist.length === 0) return;
  console.log('  ネットリスト:');
  const width = Math.max(...netlist.map((net) => net.name.length));
  for (const net of netlist) console.log(`    ${net.name.padEnd(width)} : ${net.refs.join(', ')}`);
}

/**
 * 言うことを標準エラーへ。**プレビューの帯と同じ文面**で、行番号・行の中身・
 * 綴りを指す印まで揃える (直す場所を探す手間を減らす)。
 *
 * **読めなかったものを先に出す。** ERC と当たり判定は足 1 本につき 1 件出るので、
 * 行順のままだと本物のエラーが流れていく (帯と同じ理由)。
 */
const report = (errors: readonly FenceError[], notices: readonly FenceError[]): void => {
  for (const error of [...errors, ...notices]) console.error(errorText(error));
};

function main(argv: readonly string[]): number {
  const parsed = parseArgs(argv);
  if (!parsed.ok) {
    console.error(`${parsed.message}\n\n${USAGE}`);
    return 2;
  }

  const { command, targets, outDir } = parsed.value;
  const writing = command === 'render';
  let failed = 0;

  try {
    if (writing && outDir) mkdirSync(outDir, { recursive: true });

    for (const target of targets.flatMap(collectFiles)) {
      for (const job of jobsFor(target, outDir)) {
        const { svg, netlist, errors, notices } = renderPerfboard(job.source);
        if (!writing) {
          console.log(job.label);
        } else if (svg) {
          // 図が 1 つも組めなければ SVG は空。空のファイルを置くより、書かないほうがよい。
          writeFileSync(job.outPath, `${svg}\n`);
          console.log(`${job.label} → ${job.outPath}`);
        } else {
          console.log(`${job.label} → 図を組めませんでした`);
        }
        reportNetlist(netlist);
        report(errors, notices);
        failed += errors.length;
      }
    }
  } catch (error) {
    // 読めない・書けないはユーザーの指定ミスであることが大半なので、
    // スタックトレースではなく理由だけを出す。
    console.error(`ファイルを扱えませんでした: ${reason(error)}`);
    return 2;
  }

  return failed === 0 ? 0 : 1;
}

process.exitCode = main(process.argv.slice(2));
