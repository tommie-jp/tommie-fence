#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { extractBreadboardFences, scenesOfBreadboard } from 'breadboard-fence/src/core';
import { extractCircuitFences, scenesOfCircuit } from 'circuit-fence/src/core';
import { extractPerfboardFences, scenesOfPerfboard } from 'perfboard-fence/src/core';
import type { SceneFence } from 'fence-kit';
import {
  checkFence, formatRow, formatSummary, formatTop, rowsOf, summarize, topFigures,
} from '../core/index.ts';
import type { FenceInput, FigureResult, SceneMakers } from '../core/index.ts';
import { USAGE, parseArgs } from './args.ts';

const MAKERS: SceneMakers = {
  circuit: scenesOfCircuit,
  breadboard: scenesOfBreadboard,
  perfboard: scenesOfPerfboard,
};

const EXTRACT: Readonly<Record<SceneFence, (source: string) => readonly { source: string; line: number }[]>> = {
  circuit: extractCircuitFences,
  breadboard: extractBreadboardFences,
  perfboard: extractPerfboardFences,
};

/** 下りないディレクトリ。描いた図の置き場と依存は検査の対象ではない。 */
const SKIPPED_DIRS = new Set(['node_modules', 'out', 'dist']);

/** Markdown を集める。ディレクトリは下まで降りる (隠しディレクトリは見ない)。並びは名前順。 */
function markdownFiles(target: string): string[] {
  if (!statSync(target).isDirectory()) return [target];
  return readdirSync(target, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => {
      const path = join(target, entry.name);
      if (entry.isDirectory()) {
        return entry.name.startsWith('.') || SKIPPED_DIRS.has(entry.name) ? [] : markdownFiles(path);
      }
      return entry.isFile() && entry.name.endsWith('.md') ? [path] : [];
    });
}

function main(argv: readonly string[]): number {
  const parsed = parseArgs(argv);
  if (!parsed.ok) {
    console.error(`${parsed.message}\n\n${USAGE}`);
    return 2;
  }
  const { targets, json, only, min, top } = parsed.value;
  const options = min === null ? {} : { min };
  const figures: FigureResult[] = [];
  for (const target of targets) {
    let files: string[];
    try {
      files = markdownFiles(target);
    } catch (error) {
      console.error(`読めません: ${target} (${error instanceof Error ? error.message : String(error)})`);
      return 2;
    }
    for (const path of files) {
      const text = readFileSync(path, 'utf8');
      const shown = relative(process.cwd(), path) || path;
      const fences: FenceInput[] = only.flatMap((fence) =>
        EXTRACT[fence](text).map((block) => ({ fence, source: block.source, line: block.line })));
      fences.sort((a, b) => a.line - b.line);
      for (const fence of fences) figures.push(...checkFence(shown, fence, MAKERS, options));
    }
  }

  const rows = rowsOf(figures);
  const summary = summarize(figures);
  if (json) {
    const failures = figures
      .filter((figure) => figure.failure !== null)
      .map(({ file, line, fence, failure }) => ({ file, line, fence, failure }));
    console.log(JSON.stringify({ summary, findings: rows, failures }, null, 2));
    return 0;
  }
  for (const row of rows) console.log(formatRow(row));
  for (const figure of figures.filter((one) => one.failure !== null)) {
    console.log(`${figure.file}:${figure.line} ${figure.fence} unreadable ${figure.failure}`);
  }
  console.log('---');
  console.log(formatSummary(summary));
  if (top > 0) {
    console.log(`--- top ${top}`);
    for (const figure of topFigures(figures, top)) console.log(formatTop(figure));
  }
  return 0;
}

process.exitCode = main(process.argv.slice(2));
