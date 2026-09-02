import type { LineEdit } from './edits.ts';

/**
 * YAML の**行そのものを出し入れ**するときの共通の手口。
 * 3 つのフェンスとも「1 部品 = 1 行、1 配線 = 1 行」なので、消すのも足すのも
 * 行の単位になり、鍵 (`parts:` / `wires:`) の扱いも同じ形になる。
 *
 * ここが持つのは**行の数え方だけ**。何を消すか (その部品を指す配線や注釈まで
 * 連れていくか) はフェンスが決める。
 */

/** その鍵の行 (1 始まり)。無ければ 0。 */
export const keyLineOf = (lines: readonly string[], key: string): number =>
  lines.findIndex((text) => new RegExp(`^\\s*${key}\\s*:`).test(text)) + 1;

/** その行が鍵の行そのものか (`parts: {R1: …}` のような 1 行書き)。 */
export const isKeyLine = (lineText: string | undefined, key: string): boolean =>
  lineText !== undefined && new RegExp(`^\\s*${key}\\s*:`).test(lineText);

/**
 * フロー形式を断る文面。**その書き方では行が 1 つのものに対応しない**ので、
 * 行ごと消すと鍵まで消える。綴りの差し替え (動かす) は今までどおり効くので、
 * 消したい人は手で消す。
 */
export const FLOW_REFUSAL = 'フロー形式 (1 行に書いた形) は行ごと消せません。手で消します';

/**
 * 消す行を書き換えに直す。**行番号の順に並べて渡す** (当てる側が後ろから
 * 当てられるように)。0 は「鍵が無い」の印なので落とす。
 */
export const dropLines = (lines: Iterable<number>): readonly LineEdit[] =>
  [...new Set(lines)]
    .filter((line) => line > 0)
    .sort((a, b) => a - b)
    .map((line) => ({ kind: 'delete' as const, line }));

/**
 * 足す行を書き換えに直す。`line` の**前**に入れる (末尾へ足すときは行数 + 1)。
 */
export const insertLines = (
  entries: Iterable<{ readonly line: number; readonly text: string }>,
): readonly LineEdit[] =>
  [...entries].map(({ line, text }) => ({ kind: 'insert' as const, line, text }));
