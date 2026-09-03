import { formatAddress, parseAddress } from '../model/address.ts';
import type { Address } from '../types.ts';

/**
 * フェンスの本文の中で**穴の綴りがどこに書かれているか**を探す。
 * マップから動かす操作は、すべてこの綴りの差し替えに落ちる。
 *
 * **YAML を組み直さない。** 手書きのコメント・整形・並び順をそのまま残すため、
 * 行の中の綴りだけを外科手術で入れ替える (circuit / breadboard と同じ約束)。
 */

/** 行末コメントの始まり。`#` は行頭か空白の直後だけコメント (YAML の規則)。 */
const COMMENT = /(^|\s)#/;

type Candidate = { readonly column: number; readonly length: number; readonly text: string };

export type AddressToken = { readonly column: number; readonly length: number; readonly address: Address };

/**
 * 綴り 1 つを候補にする。**そのままで穴に読めればそれで終わり**。
 * 読めないときだけ、配線の演算子とフロー形式の区切りで割る
 * (`b3--b7` のように空白を省いて書けるため)。
 *
 * **先に割らない。** 機器の足 (`BAT.+`) や種類の姿 (`capacitor/ceramic`) を
 * 壊さないため — どちらも穴には読めないので、割らずにそのまま落ちる。
 */
function candidatesOf(column: number, token: string, resolves: (text: string) => boolean): readonly Candidate[] {
  if (resolves(token)) return [{ column, length: token.length, text: token }];

  const pieces: Candidate[] = [];
  let last = 0;
  // stateful な `g` 付き正規表現を使い回さない (lastIndex が持ち越されて取りこぼす)。
  for (const match of token.matchAll(/--|[[\]{},]/g)) {
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
 * 鍵 (`R1:` の `R1`) は穴ではない。綴りの直後が `:` かどうかで決める
 * (行の頭でもフロー形式でも同じ規則で効く)。
 */
const isKey = (text: string, candidate: Candidate): boolean =>
  text[candidate.column + candidate.length] === ':';

/** 走査する本文。**コメントは先に切り落とす** (中の字を穴と読まないため)。 */
const withoutComment = (lineText: string): string => {
  const comment = COMMENT.exec(lineText);
  return comment === null ? lineText : lineText.slice(0, comment.index);
};

const candidatesOn = (scanned: string, resolve: (text: string) => Address | null): readonly Candidate[] =>
  [...scanned.matchAll(/[^\s:]+/g)]
    .flatMap((match) => candidatesOf(match.index ?? 0, match[0], (text) => resolve(text) !== null))
    .filter((candidate) => !isKey(scanned, candidate));

/**
 * 行の中で穴を指している綴りを全部。既定では**素の綴りだけ**で、
 * `points:` が付けた名前は拾わない (名前は行き先の 1 行を直せば付いてくる)。
 * どこから指されているかを**数える**ときは `points` を渡して名前も拾う。
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
 * 行の中から、並んだ穴を指しているトークンを左から順に消し込む。
 * **見つからない穴が 1 つでもあれば null** (半端に当てると図が壊れる)。
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

/**
 * 編集を当てる。**中身は fence-kit にある** (3 つのフェンスで同じ当て方)。
 * ここから再び輸出するのは、この階層から引く呼び出しを 1 か所に保つため。
 */
export { applyEdits } from 'fence-kit';
