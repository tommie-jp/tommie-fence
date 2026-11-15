#!/usr/bin/env node
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { compileCircuit, finishSvg } from 'circuit-fence/src/core';
import { renderTex } from 'circuit-fence/tex';
import { withCards } from 'fence-kit';
import type { CardTable } from 'fence-kit';
import { CARD_SUFFIX } from 'part-card/node';
import { checkCardText } from './run.ts';
import type { CheckedCard } from './run.ts';

/**
 * 部品カードを確かめる CLI (52 の docs/158 の 2-5・2-6)。
 *
 * - `part-card check <カードかディレクトリ…>`: 欄と決まりを検め、その部品 1 個を 3 つのフェンスで描いて、
 *   フェンスの言うこと (知らない姿など) も出す。誤りがあれば 1 を返す
 * - `part-card preview <カード…> [--out <dir>]`: 同じ図を SVG に書く。**並びが正しいかは機械では
 *   見られない** — 書いた図をデータシートの端子図と並べて、1 番ピンの位置と全部の名前を見比べる
 */

const USAGE = `使い方:
  part-card check <カードかディレクトリ...>
  part-card preview <カードかディレクトリ...> [--out <出力先>]

  カードは *.part.yaml です (置き場はワークスペースの .tommie-fence/parts/)。
  check は欄・ピンの名前の決まり・同梱の型番との重なりを検め、その部品 1 個を
  breadboard・perfboard・circuit で組んで、フェンスの言うことも出します (誤りがあれば終了コード 1)。
  preview は同じ図を SVG に書きます。--out を省くと、カードの隣の preview/ に書きます。
  書いた図とデータシートの端子図を並べ、1 番ピンの位置と全部のピンの名前を見比べてください
  (並びが正しいかは機械では見られません)。`;

type Args = { readonly verb: 'check' | 'preview'; readonly targets: readonly string[]; readonly out: string | null };

function parseArgs(argv: readonly string[]): Args | string {
  const [verb, ...rest] = argv;
  if (verb !== 'check' && verb !== 'preview') return 'check か preview を指定します';
  const targets: string[] = [];
  let out: string | null = null;
  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index] ?? '';
    if (argument === '--out') {
      if (verb !== 'preview') return 'check は何も書き出さないので --out は使えません';
      const value = rest[index + 1];
      if (value === undefined || value.startsWith('-')) return '--out の後ろに出力先を書きます';
      out = value;
      index += 1;
    } else if (argument.startsWith('-')) {
      return `知らないオプションです: ${argument}`;
    } else {
      targets.push(argument);
    }
  }
  if (targets.length === 0) return 'カードかディレクトリを指定します';
  return { verb, targets, out };
}

const cardFiles = (target: string): readonly string[] =>
  (statSync(target).isDirectory()
    ? readdirSync(target).filter((name) => name.endsWith(CARD_SUFFIX)).sort().map((name) => join(target, name))
    : [target]);

const stemOf = (path: string): string => basename(path, CARD_SUFFIX);

/** 回路図の TeX を SVG にする (WASM の TeX。1 枚 1 秒ほど)。 */
async function circuitSvg(source: string, cards: CardTable): Promise<string | null> {
  const compiled = withCards(cards, () => compileCircuit(source, { cards }));
  if (compiled.tex === null) return null;
  const outcome = await renderTex(compiled.tex);
  if (!outcome.ok) return null;
  return finishSvg(outcome.svg, { notes: compiled.notes, theme: compiled.theme, width: compiled.width });
}

async function writePreview(path: string, checked: CheckedCard, out: string | null): Promise<readonly string[]> {
  const directory = out ?? join(dirname(path), 'preview');
  mkdirSync(directory, { recursive: true });
  const written: string[] = [];
  for (const figure of checked.figures) {
    const svg = figure.fence === 'circuit'
      ? (checked.table === null ? null : await circuitSvg(figure.source, checked.table))
      : figure.svg;
    if (svg === null) continue;
    const file = join(directory, `${stemOf(path)}-${figure.fence}.svg`);
    writeFileSync(file, `${svg}\n`);
    written.push(file);
  }
  return written;
}

async function main(argv: readonly string[]): Promise<number> {
  const args = parseArgs(argv);
  if (typeof args === 'string') {
    console.error(`${args}\n\n${USAGE}`);
    return 2;
  }
  let failed = 0;
  try {
    for (const path of args.targets.flatMap(cardFiles)) {
      const checked = checkCardText(readFileSync(path, 'utf8'), path);
      for (const line of checked.lines) console.error(line.text);
      const errors = checked.lines.filter((line) => line.severity === 'error').length;
      failed += errors + (checked.card === null && errors === 0 ? 1 : 0);
      if (args.verb === 'check') {
        console.log(`${path}: ${errors === 0 ? `読めました (${checked.figures.map((figure) => figure.fence).join('・')} で組めます)` : `誤り ${errors} 件`}`);
        continue;
      }
      if (checked.card === null) continue;
      for (const file of await writePreview(path, checked, args.out)) console.log(`${path} → ${file}`);
    }
  } catch (error) {
    console.error(`ファイルを扱えませんでした: ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }
  return failed === 0 ? 0 : 1;
}

void main(process.argv.slice(2)).then((code) => {
  process.exitCode = code;
});
