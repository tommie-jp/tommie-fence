import { normalizeNewlines } from 'fence-kit';
import type { Edit } from 'fence-kit';
import { formatAddress, parseAddress } from '../model/address.ts';
import type { Address } from '../types.ts';

/**
 * フェンスの本文の中で**番地の綴りがどこに書かれているか**を探す。
 * マップから動かす操作は、すべてこの綴りの差し替えに落ちる。
 *
 * **YAML を組み直さない。** 手書きのコメント・整形・並び順をそのまま残すため、
 * 行の中の綴りだけを外科手術で入れ替える (circuit と同じ約束)。
 *
 * モデルは行番号を持つが**行内の桁は持たない**ので、行を走査して探す。
 * 番地の綴りは文法が一意に縛っているので、これで足りる。
 */

/** 行末コメントの始まり。`#` は行頭か空白の直後だけコメント (YAML の規則)。 */
const COMMENT = /(^|\s)#/;

type Candidate = { readonly column: number; readonly length: number; readonly text: string };

export type AddressToken = { readonly column: number; readonly length: number; readonly address: Address };

/**
 * 綴り 1 つを候補にする。**そのままで番地に読めればそれで終わり**。
 * 読めないときだけ割る:
 *
 * - `b12(A)` — 極性の印が付いた穴。番地は `(` の前
 * - `a10--b12` — 空白を省いた配線。演算子で割る
 * - `[a1 -- a3,` — フロー形式の区切り
 *
 * **先に割らない。** `-` は `points:` の名前にも使える字なので、
 * 読める綴りを先に割ると名前を壊す。
 */
function candidatesOf(column: number, token: string, resolves: (text: string) => boolean): readonly Candidate[] {
  if (resolves(token)) return [{ column, length: token.length, text: token }];

  const pieces: Candidate[] = [];
  let last = 0;
  // 配線の演算子・タグの括弧・フロー形式の区切り。stateful な `g` 付き正規表現を
  // 使い回さない (lastIndex が持ち越されて取りこぼす) ので、その場で作る。
  for (const match of token.matchAll(/--|[()[\]{},]/g)) {
    const index = match.index ?? 0;
    if (index > last) pieces.push({ column: column + last, length: index - last, text: token.slice(last, index) });
    last = index + match[0].length;
  }
  if (last < token.length) {
    pieces.push({ column: column + last, length: token.length - last, text: token.slice(last) });
  }
  return pieces;
}

/**
 * 鍵 (`R1:` の `R1`) は穴ではない。**`C1` は番地 `c1` としても読める**ので、
 * 見分けないと部品の名前のほうを書き換えてしまう。
 * 綴りの直後が `:` かどうかで決める (行の頭でもフロー形式でも同じ規則で効く)。
 */
const isKey = (text: string, candidate: Candidate): boolean =>
  text[candidate.column + candidate.length] === ':';

/**
 * 迂回ヒントの角括弧。**中身は番地とそっくり** (`[v-20, h30]` の `h30` は
 * 行 h の 30 列目としても読める) ので、走査の前に切り落とす。
 * 残さないと、端点を動かしたつもりでヒントのほうを書き換える。
 */
const HINTS = /\s*\[[^\]]*\]?\s*$/;

/**
 * 走査する本文。**コメントと迂回ヒントを先に切り落とす**。
 * どちらも番地に読める字を含みうるので、残すと別の場所を書き換える。
 */
const withoutComment = (lineText: string): string => {
  const comment = COMMENT.exec(lineText);
  const body = comment === null ? lineText : lineText.slice(0, comment.index);
  return body.replace(HINTS, '');
};

const candidatesOn = (
  scanned: string,
  resolve: (text: string) => Address | null,
): readonly Candidate[] =>
  [...scanned.matchAll(/[^\s:]+/g)]
    .flatMap((match) => candidatesOf(match.index ?? 0, match[0], (text) => resolve(text) !== null))
    .filter((candidate) => !isKey(scanned, candidate));

/**
 * 行の中で番地を指している綴りを全部。既定では**素の綴りだけ**で、
 * `points:` が付けた名前は拾わない (名前は行き先の 1 行を直せば付いてくる)。
 * どこから指されているかを**数える**ときは `points` を渡して名前も拾う。
 *
 * 配線の行に使う。端点と演算子と色とヒントしか無い行なので、番地に読める
 * 綴りはすべて端点になる (色も `[v-20]` も番地には読めない)。
 */
export function addressTokensOn(
  lineText: string,
  points?: ReadonlyMap<string, Address>,
): readonly AddressToken[] {
  const scanned = withoutComment(lineText);
  const resolve = (text: string): Address | null => parseAddress(text) ?? points?.get(text) ?? null;

  return candidatesOn(scanned, resolve).flatMap((candidate) => {
    const address = resolve(candidate.text);
    return address === null ? [] : [{ column: candidate.column, length: candidate.length, address }];
  });
}

/**
 * 行の中から、並んだ番地を指しているトークンを左から順に消し込む。
 * **見つからない番地が 1 つでもあれば null** (半端に当てると図が壊れる)。
 *
 * `from` から先だけを見る。1 行に部品が 2 つ以上あるとき (フロー形式) に、
 * 前の部品が消し込んだ続きから探すため。頭から探し直すと同じ綴りを二度拾う。
 */
export function locateTokens(
  lineText: string,
  addresses: readonly Address[],
  points: ReadonlyMap<string, Address>,
  from = 0,
): { readonly tokens: readonly { column: number; length: number }[]; readonly end: number } | null {
  const scanned = withoutComment(lineText);
  const resolve = (text: string): Address | null => parseAddress(text) ?? points.get(text) ?? null;
  const candidates = candidatesOn(scanned, resolve);

  const found: { column: number; length: number }[] = [];
  let cursor = from;

  for (const address of addresses) {
    const wanted = formatAddress(address);
    let hit: { column: number; length: number } | null = null;

    for (const candidate of candidates) {
      if (candidate.column < cursor) continue;
      const resolved = resolve(candidate.text);
      if (resolved === null || formatAddress(resolved) !== wanted) continue;
      hit = { column: candidate.column, length: candidate.length };
      break;
    }

    if (hit === null) return null;
    found.push(hit);
    cursor = hit.column + hit.length;
  }

  return { tokens: found, end: cursor };
}

/** 編集を当てる。**右から当てる**ので、同じ行の桁がずれない。 */
export function applyEdits(source: string, edits: readonly Edit[]): string {
  if (edits.length === 0) return source;

  const lines = normalizeNewlines(source).split('\n');
  const ordered = [...edits].sort((a, b) => b.line - a.line || b.column - a.column);

  for (const edit of ordered) {
    const text = lines[edit.line - 1];
    if (text === undefined) continue;
    lines[edit.line - 1] = text.slice(0, edit.column) + edit.text + text.slice(edit.column + edit.length);
  }
  return lines.join('\n');
}
