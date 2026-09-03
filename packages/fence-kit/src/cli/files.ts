import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';

/**
 * CLI が読む入力の集め方。**3 つのフェンスで同じもの**を使う。
 *
 * **ここだけは Node の API を使う。** fence-kit の本体 (`index.ts` から辿れる
 * もの) は DOM も Node も使わない約束だが、`fence-kit/cli` は CLI 専用の入口で、
 * webview にもプレビューにも束ねられない。`purity.test.ts` がこの区別を見張る。
 *
 * 実測して引き上げた: 3 つの `cli/main.ts` でこの関数は 1 字も違わなかった。
 * **写しが 3 つあると片方だけ直る** — 実際、空のディレクトリを断る守りは
 * perfboard にしか入っていなかった。
 */

const isYaml = (path: string): boolean => ['.yaml', '.yml'].includes(extname(path));
const isMarkdown = (path: string): boolean => ['.md', '.markdown'].includes(extname(path));

/** そのファイルは 1 枚の図として読むか (`.md` はフェンスを取り出す)。 */
export const isYamlInput = (path: string): boolean => isYaml(path);

/**
 * 指定から読むファイルを並べる。
 *
 * **ディレクトリは 1 段だけ見る。** `examples/errors/` のようにわざと読めなく
 * 書いた置き場を、`render examples` が巻き込まないため。
 *
 * **1 つも見つからない指定は黙って通さない。** 空のディレクトリを渡した CI が、
 * 何も検証しないまま緑になる。
 */
export function collectFiles(target: string): readonly string[] {
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

/** 入力 1 つを読んだもの。フェンスの取り出し方はフェンスが決めるので、本文だけ渡す。 */
export type Input = {
  readonly source: string;
  /** 拡張子を落としたファイル名。書き出す名前の頭になる。 */
  readonly stem: string;
  /** 書き出し先のディレクトリ (`--out` を省けば入力と同じ場所)。 */
  readonly directory: string;
  /** `.yaml` は丸ごと 1 枚の図。`.md` はフェンスを取り出す。 */
  readonly whole: boolean;
};

export const readInput = (path: string, outDir: string | null): Input => ({
  source: readFileSync(path, 'utf8'),
  stem: basename(path, extname(path)),
  directory: outDir ?? resolve(path, '..'),
  whole: isYaml(path),
});
