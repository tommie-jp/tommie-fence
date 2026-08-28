#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import {
  STAMP_TEXT, compileCircuit, errorLine, extractCircuitFences, finishSvg, messageLine, outputStem,
  shiftErrors,
} from '../core/index.ts';
import type { FenceError, Net } from '../core/index.ts';
import { renderTex } from '../host/texSvg.ts';
import { standaloneTex } from '../core/tex/generate.ts';
import { texErrors } from '../core/tex/texLog.ts';
import { USAGE, parseArgs } from './args.ts';

type Job = {
  readonly source: string;
  readonly stem: string;
  readonly directory: string;
  readonly label: string;
  /**
   * そのフェンスの ``` が書かれた Markdown の行 (`.yaml` は 0)。
   * 読めなかった行を Markdown の行へ戻すのに使う (プレビューの帯と揃える)。
   */
  readonly line: number;
};

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

  if (isYaml(path)) return [{ source, stem, directory, label: stem, line: 0 }];

  const fences = extractCircuitFences(source);
  return fences.map((fence, index) => ({
    source: fence.source,
    stem: outputStem(stem, index, fences.length),
    directory,
    label: `${stem} (${fence.line} 行目)`,
    line: fence.line,
  }));
}

function reportNetlist(netlist: readonly Net[]): void {
  if (netlist.length === 0) return;
  console.log('  ネットリスト:');
  const width = Math.max(...netlist.map((net) => net.name.length));
  for (const net of netlist) console.log(`    ${net.name.padEnd(width)} : ${net.refs.join(', ')}`);
}

/** 標準エラーへ出す 1 行。どのコマンドが言っているかが分かるよう名札を付ける。 */
const reportProblem = (message: string): void => console.error(`circuit: ${message}`);

const reportErrors = (errors: readonly FenceError[]): void => {
  // errorLine が名札を持っているので、ここでは字下げだけして並べる。
  for (const error of errors) console.error(`  ${errorLine(error)}`);
};

/** 図が描けたうえでの補足。読めなかったわけではないので終了コードには数えない。 */
const reportNotices = (notices: readonly FenceError[]): void => {
  for (const notice of notices) console.log(`  お知らせ: ${messageLine(notice)}`);
};

const firstLine = (text: string): string => text.split('\n', 1)[0] ?? '';

/**
 * その `.tex` を書いてよいか。
 *
 * プレビュー用と `--emit-tex` の `.tex` は同じ名前になるので、`--out` を分け
 * 忘れると片方が黙って消える (examples/out はスナップショットの期待値でもある)。
 * 文書クラスの行が食い違うときは、書かずに知らせる。
 */
function canWriteTex(path: string, next: string): boolean {
  if (!existsSync(path)) return true;
  return firstLine(readFileSync(path, 'utf8')) === firstLine(next);
}

const reportTexClash = (label: string, path: string): void =>
  reportProblem(`${label}: ${path} は別の向けに書かれた .tex です (--out を分けてください)`);

/**
 * 手元の LaTeX に渡す `.tex` だけを書き出す。図は描かない。
 * フェンスでは断る日本語の値がここでは通るので、**検証からやり直す**
 * (描いたものを後から書き換えるのではなく、別の的に向けて組み直す)。
 */
function emitTex(job: Job): number {
  const { tex, netlist, errors: raw, notices } = compileCircuit(job.source, { target: 'latex' });
  // 行番号は Markdown の行で返す。プレビューの帯とも、図に書き出した番号とも揃う。
  const errors = shiftErrors(raw, job.line);

  if (tex === null) {
    reportProblem(`${job.label}: 図にできませんでした`);
    reportErrors(errors);
    return errors.length;
  }

  const texPath = join(job.directory, `${job.stem}.tex`);
  const document = `${standaloneTex(tex, 'latex')}\n`;
  if (!canWriteTex(texPath, document)) {
    reportTexClash(job.label, texPath);
    return errors.length + 1;
  }

  writeFileSync(texPath, document);
  console.log(`${job.label} → ${texPath} (xelatex で組んでください)`);
  reportNetlist(netlist);
  reportErrors(errors);
  reportNotices(shiftErrors(notices, job.line));
  return errors.length;
}

/**
 * 1 枚**調べるだけ**。何も書き出さず、読めなかった行とネットリストを出す。
 *
 * 図を描かないので WASM の TeX を回さない (1 枚 1 秒近くかかる)。
 * 書きながら回すときと、CI で文法だけを見るときのための道。
 * 見るものは描くときとまったく同じ (compileCircuit を同じ的で呼ぶ) ので、
 * ここで通った図はプレビューでも同じことを言われない。
 */
function checkJob(job: Job): number {
  const { tex, netlist, errors: raw, notices } = compileCircuit(job.source);
  const errors = shiftErrors(raw, job.line);

  if (tex === null) {
    reportProblem(`${job.label}: 図にできませんでした`);
    reportErrors(errors);
    return Math.max(errors.length, 1);
  }

  console.log(`${job.label}: 読めました`);
  reportNetlist(netlist);
  reportErrors(errors);
  reportNotices(shiftErrors(notices, job.line));
  return errors.length;
}

/** 1 枚描く。図にできなかった数を返す。 */
async function runJob(job: Job): Promise<number> {
  const { tex, lineMap, netlist, theme, width, notes, errors: raw, notices } = compileCircuit(job.source);
  const errors = shiftErrors(raw, job.line);

  if (tex === null) {
    reportProblem(`${job.label}: 図にできませんでした`);
    reportErrors(errors);
    return errors.length;
  }

  const texPath = join(job.directory, `${job.stem}.tex`);
  // 書き出す .tex は LaTeX にそのまま渡せる形にする (文書クラスを足す)。
  const document = `${standaloneTex(tex, 'fence')}\n`;
  if (!canWriteTex(texPath, document)) {
    reportTexClash(job.label, texPath);
    return errors.length + 1;
  }
  writeFileSync(texPath, document);

  // 描画は 1 枚ずつ。node-tikzjax は同時に 2 枚描くと状態が壊れる。
  const outcome = await renderTex(tex);
  if (!outcome.ok) {
    const failures = shiftErrors(
      outcome.kind === 'tex-log'
        ? texErrors(outcome.log, lineMap, outcome.preambleLines)
        : [{ message: outcome.message, line: null }],
      job.line,
    );
    reportProblem(`${job.label} → ${texPath} (SVG は書けませんでした)`);
    reportErrors([...errors, ...failures]);
    return errors.length + Math.max(failures.length, 1);
  }

  const svgPath = join(job.directory, `${job.stem}.svg`);
  // プレビューと同じ注釈・色・大きさを当ててから書き出す (仕上げの順番は
  // core/render/finish.ts が持っている)。auto のときの線は currentColor の
  // ままで、単体で開けば地の文字色 (黒) になる。
  writeFileSync(svgPath, `${finishSvg(outcome.svg, { notes, theme, width })}\n`);
  console.log(`${job.label} → ${svgPath}`);
  reportNetlist(netlist);
  reportErrors(errors);
  reportNotices(shiftErrors(notices, job.line));
  return errors.length;
}

async function main(argv: readonly string[]): Promise<number> {
  const parsed = parseArgs(argv);
  if (!parsed.ok) {
    reportProblem(`${parsed.message}\n\n${USAGE}`);
    return 2;
  }

  if (parsed.value.command === 'version') {
    console.log(STAMP_TEXT);
    return 0;
  }

  const { command, targets, outDir, emitTex: texOnly } = parsed.value;
  let failed = 0;

  try {
    if (outDir) mkdirSync(outDir, { recursive: true });

    // 同じ名前で 2 回書くと、先に書いたほうが黙って消える
    // (`foo.md` と `foo.yaml` を一緒に渡したときなど)。
    const written = new Map<string, string>();

    for (const target of targets.flatMap(collectFiles)) {
      for (const job of jobsFor(target, outDir)) {
        // check は何も書き出さないので、書き出し先の重なりは起きない。
        if (command === 'check') {
          failed += checkJob(job);
          continue;
        }

        const path = join(job.directory, job.stem);
        const owner = written.get(path);
        if (owner !== undefined) {
          reportProblem(`${job.label}: 出力先が ${owner} と重なります (--out を分けるか名前を変えてください)`);
          failed += 1;
          continue;
        }
        written.set(path, job.label);
        failed += texOnly ? emitTex(job) : await runJob(job);
      }
    }
  } catch (error) {
    // 読めない・書けないはユーザーの指定ミスであることが大半なので、
    // スタックトレースではなく理由だけを出す。
    reportProblem(`ファイルを扱えませんでした: ${reason(error)}`);
    return 2;
  }

  return failed === 0 ? 0 : 1;
}

// CommonJS で束ねるのでトップレベル await は使えない。
// 待ってから終了コードを立てる (プロセスはこの Promise が片付くまで生きている)。
void main(process.argv.slice(2)).then((code) => {
  process.exitCode = code;
});
