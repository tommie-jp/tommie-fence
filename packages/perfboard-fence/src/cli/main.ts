#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { errorText, extractPerfboardFences, renderPerfboard } from '../core/index.ts';
import type { FenceError } from '../core/index.ts';
import { collectFiles, readInput, reportNetlist } from 'fence-kit/cli';
import { outputStem } from 'fence-kit';
import { STAMP_TEXT } from '../core/version.ts';
import { USAGE, parseArgs } from './args.ts';

type Job = { readonly source: string; readonly outPath: string; readonly label: string };

const reason = (error: unknown): string => (error instanceof Error ? error.message : String(error));

function jobsFor(path: string, outDir: string | null): Job[] {
  const { source, stem, directory, whole } = readInput(path, outDir);
  if (whole) return [{ source, outPath: join(directory, `${stem}.svg`), label: stem }];

  const fences = extractPerfboardFences(source);
  // 名前の付け方は fence-kit にある (3 つのフェンスで同じもの。書き写さない)。
  return fences.map((fence, index) => ({
    source: fence.source,
    outPath: join(directory, `${outputStem(stem, index, fences.length)}.svg`),
    label: `${stem} (${fence.line} 行目)`,
  }));
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

  // **版を訊かれたら答えて終わる。** 図も検証もしないので、下の段取りへ進まない。
  if (parsed.value.command === 'version') {
    console.log(STAMP_TEXT);
    return 0;
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
