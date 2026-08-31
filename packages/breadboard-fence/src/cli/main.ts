#!/usr/bin/env node
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import { errorText, extractBreadboardFences, renderBreadboard } from '../core/index.ts';
import type { FenceError, Net } from '../core/index.ts';
import { USAGE, parseArgs } from './args.ts';

type Job = { readonly source: string; readonly outPath: string; readonly label: string };

const isYaml = (path: string): boolean => ['.yaml', '.yml'].includes(extname(path));
const isMarkdown = (path: string): boolean => ['.md', '.markdown'].includes(extname(path));

const reason = (error: unknown): string => (error instanceof Error ? error.message : String(error));

function collectFiles(target: string): string[] {
  const stats = statSync(target);
  if (!stats.isDirectory()) return [target];
  return readdirSync(target)
    .map((name) => join(target, name))
    .filter((path) => statSync(path).isFile() && (isYaml(path) || isMarkdown(path)))
    .sort();
}

function jobsFor(path: string, outDir: string | null): Job[] {
  const stem = basename(path, extname(path));
  const directory = outDir ?? resolve(path, '..');
  const source = readFileSync(path, 'utf8');

  if (isYaml(path)) return [{ source, outPath: join(directory, `${stem}.svg`), label: stem }];

  const fences = extractBreadboardFences(source);
  return fences.map((fence, index) => ({
    source: fence.source,
    outPath: join(directory, fences.length === 1 ? `${stem}.svg` : `${stem}-${index + 1}.svg`),
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
 * 読めなかったところとお知らせを標準エラーへ。**プレビューの帯と同じ文面**で、
 * 行番号・行の中身・綴りを指す印まで揃える (直す場所を探す手間を減らす)。
 * `style: debug: off` はプレビューの見え方の指定なので、ここでは伏せない。
 */
const reportErrors = (errors: readonly FenceError[], notices: readonly FenceError[]): void => {
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
        const { svg, netlist, errors, notices } = renderBreadboard(job.source);
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
        reportErrors(errors, notices);
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
