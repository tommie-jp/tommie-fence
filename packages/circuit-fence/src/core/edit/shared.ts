import { compileCircuit } from '../index.ts';
import type { Circuit } from '../model/circuit.ts';
import { fenceError } from '../errors.ts';
import { partOfHandle } from './handles.ts';
import { LIMITS } from '../limits.ts';
import { formatAddress, parseAddress } from '../model/address.ts';
import type { Address } from '../model/address.ts';
import type { FenceError, PartSpec } from '../types.ts';

/**
 * 書き換えの土台。**部品を動かす (`move.ts`) と節点を動かす (`point.ts`) が
 * 同じものを使う**ためにここへ置く。別々に持つと、片方の当て方だけを直したときに
 * もう片方が黙って古いままになる (`pinRef` を 2 か所に持って検証が黙った件と同じ型)。
 *
 * どれも vscode を知らない純関数 (設計上の約束 1)。
 */

/**
 * 行と桁の数え方は**3 つのフェンスで同じ**なので fence-kit にある。
 * ここから再び輸出するのは、円環の書き換えを避けるため
 * (`core/edit` の中は今までどおり `shared.ts` から取る)。
 */
import type { Connection, Edit, NetDiff, Rewrite } from 'fence-kit';

export { strippedIndent } from 'fence-kit';
export type { Connection, Edit, LineEdit, NetDiff, Rewrite, Span } from 'fence-kit';

export type Move = { readonly edits: readonly Edit[]; readonly diff: NetDiff };

export type MoveResult =
  | { readonly ok: true; readonly value: Move }
  | { readonly ok: false; readonly error: FenceError };

export type RewriteResult =
  | { readonly ok: true; readonly value: Rewrite }
  | { readonly ok: false; readonly error: FenceError };

/** 格子の一番下の行 (`z`)。 */
export const LAST_ROW = 25;

/** 断る 1 件。**`MoveResult` にも `RewriteResult` にもそのまま返せる形**にしておく。 */
export const fail = (message: string, line: number | null): { readonly ok: false; readonly error: FenceError } =>
  ({ ok: false, error: fenceError(message, line) });

/** 格子の内側か。`formatAddress` は範囲外を丸めるので、動かす前にここで見る。 */
export const isOnGrid = (address: Address): boolean =>
  address.row >= 0 && address.row <= LAST_ROW && address.col >= 0 && address.col <= LIMITS.columns - 1;

/**
 * 組を 1 つの綴りにするときの区切り。**端子の名前に現れない字**を選ぶ。
 * 生のバイトを直に書かない — 見えない字がソースに残ると、git が binary 扱いに
 * して差分もレビューも効かなくなる (実際に踏んだ)。
 */
const SEPARATOR = '\u0000';

/** ネットリストを「つながっている端子の組」の集合にする。 */
function connectionsOf(source: string): Set<string> {
  const pairs = new Set<string>();
  for (const net of compileCircuit(source).netlist) {
    const refs = [...net.refs].sort();
    for (let i = 0; i < refs.length; i += 1) {
      for (let j = i + 1; j < refs.length; j += 1) pairs.add(`${refs[i]}${SEPARATOR}${refs[j]}`);
    }
  }
  return pairs;
}

const toConnections = (keys: readonly string[]): Connection[] =>
  keys.map((key) => key.split(SEPARATOR) as unknown as Connection);

/** 移動の前後でネットリストを比べ、離れる接続と生まれる接続を出す。 */
export function diffOf(before: string, after: string): NetDiff {
  const was = connectionsOf(before);
  const now = connectionsOf(after);

  return {
    lost: toConnections([...was].filter((pair) => !now.has(pair)).sort()),
    gained: toConnections([...now].filter((pair) => !was.has(pair)).sort()),
  };
}

/** 部品が持つ番地。**先頭がアンカー。** 3 か所で別々に持つと部品の種類を足したとき片方が黙って古くなる。 */
export function addressesOf(part: PartSpec): readonly Address[] {
  if (part.kind === 'two-terminal') return [part.from, part.to];
  return [part.at];
}

/** 行末コメントの始まり。`#` は行頭か空白の直後だけコメント (YAML の規則)。 */
const COMMENT = /(^|\s)#/;

type Candidate = { readonly column: number; readonly length: number; readonly text: string };

/**
 * 空白で切った綴り 1 つを候補にする。空白を省いた配線 (`a1--a3|-c5`) と
 * フロー形式 (`[a1 -- a3, b1 -- b5]`) は 1 綴りの中に端子が埋まるので、
 * **綴りのままで読めないときだけ**演算子と区切りでさらに割る
 * (先に割ると、`-` を含む `points:` の名前を壊しかねない)。
 * 区切りが無ければ割っても丸ごと 1 つに戻るだけなので、場合分けは要らない。
 */
function candidatesOf(
  column: number,
  token: string,
  resolves: (text: string) => boolean,
): readonly Candidate[] {
  if (resolves(token)) return [{ column, length: token.length, text: token }];

  const pieces: Candidate[] = [];
  let last = 0;
  // 配線の演算子とフロー形式の区切り (`[` `]` `{` `}` `,`)。stateful な
  // `g` 付き正規表現を使い回さない (lastIndex が持ち越されて取りこぼす) ため、
  // ここで作る。
  for (const match of token.matchAll(/--|-\||\|-|[[\]{},]/g)) {
    const index = match.index ?? 0;
    if (index > last) pieces.push({ column: column + last, length: index - last, text: token.slice(last, index) });
    last = index + match[0].length;
  }
  if (last < token.length) {
    pieces.push({ column: column + last, length: token.length - last, text: token.slice(last) });
  }
  return pieces;
}

/** 行末コメントを落とした行。`#` から後ろは YAML が読まない。 */
const uncommented = (text: string): string => {
  const comment = COMMENT.exec(text);
  return comment === null ? text : text.slice(0, comment.index);
};

/** 行の中の空白で切った綴り 1 つ。 */
export type Token = { readonly column: number; readonly text: string };

/** その桁より後ろの綴り。コメントは見ない (書き換えの的にしない)。 */
export const tokensFrom = (text: string, at: number): readonly Token[] =>
  [...uncommented(text).matchAll(/\S+/g)]
    .map((match) => ({ column: match.index ?? 0, text: match[0] }))
    .filter((token) => token.column >= at);

/**
 * 綴り 1 つを足す・差し替える・消す編集。空の字を渡すと**消す**。
 *
 * **欄 (`field.ts`) と向きの語 (`turn.ts`) が同じものを通す** — 別々に持つと、
 * 消したあとに空白が 2 つ残る類の直しが片方にだけ入る。
 */
export function wordEdit(line: number, found: Token | null, text: string, append: number): readonly Edit[] {
  if (found === null) {
    return text === '' ? [] : [{ line, column: append, length: 0, text: ` ${text}` }];
  }
  return text === ''
    // 前の空白ごと消す (消したあとに空白が 2 つ残らない)。
    ? [{ line, column: found.column - 1, length: found.text.length + 1, text: '' }]
    : [{ line, column: found.column, length: found.text.length, text }];
}

/** 行の中で番地に読めた綴り 1 つ。 */
export type AddressToken = { readonly column: number; readonly length: number; readonly address: Address };

/**
 * 鍵 (`R1:` の `R1`) は端子ではない。**`C1` は番地 `c1` としても読める**ので、
 * 見分けないと部品の名前のほうを書き換えてしまう。
 * 綴りの直後が `:` かどうかで決める — フロー形式 (`{R1: …, R2: …}`) でも
 * 行の頭でも同じ規則で効く (「行の最初のコロンより後ろ」では効かなかった)。
 */
const isKey = (text: string, candidate: Candidate): boolean =>
  text[candidate.column + candidate.length] === ':';

/**
 * 行の中で番地を指している綴りを全部。既定では**素の綴りだけ**で、
 * `points:` が付けた名前は拾わない (名前は行き先の 1 行を直せば付いてくるので、
 * 書き換える側はこちらを使う)。どこから指されているかを**数える**ときは
 * `points` を渡して名前も拾う。
 *
 * 配線の行に使う。**端点と演算子しか無い行なので、番地に読める綴りはすべて端点**。
 * 数珠つなぎ (`a1 -- a3 -- a5`) とフロー形式 (`[a1 -- a3, a3 -- b5]`) は
 * モデルの上では同じ形になり、綴りが 1 つか 2 つかはモデルからは決まらない。
 */
export function addressTokensOn(
  lineText: string,
  points?: ReadonlyMap<string, Address>,
): readonly AddressToken[] {
  const comment = COMMENT.exec(lineText);
  const scanned = comment === null ? lineText : lineText.slice(0, comment.index);

  const resolve = (text: string): Address | null => parseAddress(text) ?? points?.get(text) ?? null;
  return [...scanned.matchAll(/[^\s:]+/g)]
    .flatMap((match) => candidatesOf(match.index ?? 0, match[0], (text) => resolve(text) !== null))
    .filter((candidate) => !isKey(scanned, candidate))
    .flatMap((candidate) => {
      const address = resolve(candidate.text);
      return address === null ? [] : [{ column: candidate.column, length: candidate.length, address }];
    });
}

/**
 * 行の中から、並んだ番地を指しているトークンを左から順に消し込む。
 * 見つからない番地が 1 つでもあれば null (半端に見つけて当てると図が壊れる)。
 *
 * `from` から先だけを見る。**1 行に部品が 2 つ以上あるとき** (フロー形式の
 * `parts: {R1: …, R2: …}`) に、前の部品が消し込んだ続きから探すため。
 * 頭から探し直すと同じ綴りを二度拾い、後ろの部品を取り逃す。
 *
 * **モデルは行番号を持つが、行内の桁は持たない。** 桁を全トークンへ運ぶ改修は
 * 使い手がここしか無いので割に合わない — 行を走査して探す。
 * 番地の綴りは文法が一意に縛っているので、これで足りる
 * (`points:` の名前で書かれた端子も、名前から引いて同じ番地に落ちる)。
 *
 * 期待した並びを左から消し込むので、**値・ラベル・行末コメントには届かない**
 * (コメントは走査の前に切り落とし、端子は値より左に書かれている)。
 */
export function locateTokens(
  lineText: string,
  addresses: readonly Address[],
  points: ReadonlyMap<string, Address>,
  from = 0,
): { readonly tokens: readonly { column: number; length: number }[]; readonly end: number } | null {
  // **コメントは先に切り落とす。** 中に `:` があると下の「頭の名前」の目印を
  // 取り違え、端子より右から探し始めて正しい移動を断ってしまう。
  const comment = COMMENT.exec(lineText);
  const scanned = comment === null ? lineText : lineText.slice(0, comment.index);

  const resolve = (text: string): Address | null => parseAddress(text) ?? points.get(text) ?? null;
  const candidates = [...scanned.matchAll(/[^\s:]+/g)]
    .flatMap((match) => candidatesOf(match.index ?? 0, match[0], (text) => resolve(text) !== null))
    // 鍵は端子ではない (`C1: capacitor c1 d3` の `C1` を書き換えない)。
    .filter((candidate) => !isKey(scanned, candidate));

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

/**
 * 行の出し入れまで当てる。**中身は fence-kit にある** (行の中の差し替えと同じ理由)。
 * あちらは片方だけの書き換えも受けるので、`Rewrite` をそのまま渡せる。
 */
export { applyRewrite } from 'fence-kit';

/**
 * その部品の端子が行のどこに書かれているか。**動かす側と光らせる側で 1 つ**
 * にしてある — 別々に持っていたとき、`movePart` だけが行の頭から探していて、
 * フロー形式 (`parts: {R1: …, R2: …}`) で**掴んでいないほうの部品**を
 * 書き換えていた (光る場所は正しいので、目で見て気づけない)。
 *
 * 1 行に部品が 2 つ以上並ぶので、同じ行に先に書かれた部品が消し込んだ続きから
 * 探す。頭から探し直すと前の部品の綴りを二度拾い、後ろの部品を取り逃す。
 */
export function locatePart(
  doc: Circuit,
  lines: readonly string[],
  handle: string,
): {
  readonly part: PartSpec;
  readonly text: string;
  readonly from: number;
  readonly tokens: readonly { readonly column: number; readonly length: number }[];
} | null {
  // **名札で 1 つに決めてから探す。** 同じ名前の記号が 2 つ以上あることが
  // あるので (`port` / `vcc` / `vee`)、名前で照らすと先に書いたほうを拾う。
  const target = partOfHandle(doc.parts, handle);
  if (target === null) return null;

  const cursors = new Map<number, number>();

  for (const part of doc.parts) {
    const text = lines[part.line - 1];
    if (text === undefined) continue;
    const from = cursors.get(part.line) ?? 0;
    const located = locateTokens(text, addressesOf(part), doc.points, from);
    if (located === null) continue;
    cursors.set(part.line, located.end);
    if (part === target) return { part, text, from, tokens: located.tokens };
  }
  return null;
}

/** 行の中の `名前:` の名前のほう。前後が綴りの続きでないところだけを見る。 */
export function keySpanOf(text: string, id: string, from: number): { column: number; length: number } | null {
  for (let at = text.indexOf(id, from); at !== -1; at = text.indexOf(id, at + 1)) {
    const before = text[at - 1] ?? ' ';
    if (text[at + id.length] === ':' && !/[\w.-]/.test(before)) return { column: at, length: id.length };
  }
  return null;
}
