#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { errorText, extractVnaFences, renderVna } from '../core/index.ts';
import type { FenceError } from '../core/index.ts';
import { collectFiles, readInput } from 'fence-kit/cli';
import { outputStem } from 'fence-kit';
import { STAMP_TEXT } from '../core/version.ts';
import { USAGE, parseArgs } from './args.ts';
import { dataFrom } from './data.ts';

type Job = {
  readonly source: string;
  readonly outPath: string;
  readonly label: string;
  /** フェンスが始まる行。**言うことの行番号を Markdown の行に直す**ために要る。 */
  readonly offset: number;
  /** 入力ファイルのあるディレクトリ (`data:` はここから読む)。 */
  readonly home: string;
};

const reason = (error: unknown): string => (error instanceof Error ? error.message : String(error));

function jobsFor(path: string, outDir: string | null): Job[] {
  const { source, stem, directory, whole } = readInput(path, outDir);
  const home = dirname(resolve(path));
  // `.yaml` は丸ごと 1 枚なので、行番号はそのまま (ずらさない)。
  if (whole) return [{ source, outPath: join(directory, `${stem}.svg`), label: stem, offset: 0, home }];

  const fences = extractVnaFences(source);
  return fences.map((fence, index) => ({
    source: fence.source,
    outPath: join(directory, `${outputStem(stem, index, fences.length)}.svg`),
    label: `${stem} (${fence.line} 行目)`,
    offset: fence.line,
    home,
  }));
}

/** 言うことを標準エラーへ。**プレビューの帯と同じ文面** (読めなかったものが先)。 */
const report = (said: readonly FenceError[]): void => {
  for (const error of said) console.error(errorText(error));
};

function main(argv: readonly string[]): number {
  const parsed = parseArgs(argv);
  if (!parsed.ok) {
    console.error(`${parsed.message}\n\n${USAGE}`);
    return 2;
  }
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
        const result = renderVna(job.source, { offset: job.offset, data: dataFrom(job.home) });
        const { svg, errors, notices, readingLines } = result;
        if (!writing) {
          console.log(job.label);
        } else {
          writeFileSync(job.outPath, `${svg}\n`);
          console.log(`${job.label} → ${job.outPath}`);
        }
        // 板のフェンスのネットリストの代わりに、マーカーの読み値を出す。
        for (const line of readingLines) console.log(`  ${line}`);
        report([...errors, ...notices]);
        failed += errors.length;
      }
    }
  } catch (error) {
    console.error(`ファイルを扱えませんでした: ${reason(error)}`);
    return 2;
  }

  return failed === 0 ? 0 : 1;
}

process.exitCode = main(process.argv.slice(2));
