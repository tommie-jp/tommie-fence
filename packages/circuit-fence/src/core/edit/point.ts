import { LineCounter, isMap, isScalar, parseDocument } from 'yaml';
import { formatAddress, parseAddress } from '../model/address.ts';
import type { Address } from '../model/address.ts';
import { normalizeNewlines } from '../newlines.ts';
import { parseFence } from '../parser/parseFence.ts';
import { addressTokensOn, addressesOf, applyEdits, diffOf, fail, isOnGrid, locateTokens } from './shared.ts';
import { cellOf } from '../types.ts';
import type { Edit, MoveResult } from './shared.ts';
import type { Circuit } from '../model/circuit.ts';
import type { WireSpec } from '../types.ts';

/**
 * 節点を別の番地へ動かす。**部品を動かすのとは掴む物が違う** — あちらは
 * 1 つの部品だけを運んで接続の変化を確かめさせるが、こちらは**その交点に
 * 来ているものを丸ごと**運ぶので、接続は保たれる。
 *
 * 掴む物が違えば意味も違う、で曖昧さが消える。連立置換で縮退を作る
 * 「接続を保ったまま部品を動かす」を既定にしなかったのはこのため
 * (52 の docs/06 の判断の記録)。
 *
 * `points:` で名前が付いていれば、直すのは**普通は**その行き先の 1 行だけ
 * (名前で指している部品と配線は綴りを変えずに付いてくる)。同じ番地を
 * 生の綴りでも書いていたら、そこも一緒に運ぶ — 置いていくと接続が切れて、
 * 「丸ごと運ぶ」の約束が破れる。
 *
 * 書き換えるのは **`parts:` と `wires:` と `points:` の行だけ**。`title:` と
 * `notes:` と `style:` は番地に見える字があっても触らない — 注釈は紙面に付く
 * ものだし、`circle C1 red` の C1 のように部品の名前とも番地とも読める綴りは、
 * 書いた側の意図を綴りから判別できない。
 */

/** 掴める節点 1 つ。 */
export type NodeRef = {
  readonly address: Address;
  /** `points:` が付けた名前。無ければ null。 */
  readonly name: string | null;
  /** その番地を書いている場所の数。マップで点の重みに使う。 */
  readonly uses: number;
};

/**
 * 配線の端点を、**行ごとに・書かれた順で 1 回ずつ**。
 * 数珠つなぎ (`a1 -- a3 -- a5`) は 1 行から配線が 2 本できるが、中間の綴りは
 * 1 つしか無い — 配線ごとに数えると同じ綴りを 2 回書き換えて図が壊れる。
 *
 * **数珠つなぎの続きかどうかは端点で見る。** フロー形式
 * (`wires: [a1 -- a3, b1 -- b5]`) も 1 行に配線が 2 本になるが、こちらは
 * 独立した 2 本で、始点を落とすと b1 が黙って取り残される。
 * 前の配線の終点と同じ番地から始まるものだけを続きとみなす。
 */
function writtenWireCells(wires: readonly WireSpec[]): Map<number, Address[]> {
  const byLine = new Map<number, Address[]>();
  let previous: { readonly line: number; readonly to: Address | null } | null = null;

  for (const wire of wires) {
    const cells = byLine.get(wire.line) ?? [];
    const from = cellOf(wire.from);
    const to = cellOf(wire.to);
    const chained = previous !== null && previous.line === wire.line
      && previous.to !== null && from !== null
      && formatAddress(previous.to) === formatAddress(from);
    if (from !== null && !chained) cells.push(from);
    if (to !== null) cells.push(to);
    byLine.set(wire.line, cells);
    previous = { line: wire.line, to };
  }
  return byLine;
}

/** フェンスの中で番地が書かれている場所を、番地の綴りごとに数える。 */
function usesOf(doc: Circuit): Map<string, { address: Address; uses: number }> {
  const found = new Map<string, { address: Address; uses: number }>();

  const add = (address: Address): void => {
    const key = formatAddress(address);
    const seen = found.get(key);
    found.set(key, { address, uses: (seen?.uses ?? 0) + 1 });
  };

  for (const part of doc.parts) for (const address of addressesOf(part)) add(address);
  for (const cells of writtenWireCells(doc.wires).values()) for (const cell of cells) add(cell);
  return found;
}

/**
 * 掴める節点。パース済みのモデルから引く (呼ぶ側はたいてい直前に
 * パースしているので、ここでパースし直さない)。
 */
export function nodesOf(doc: Circuit): readonly NodeRef[] {
  const nameAt = new Map<string, string>();
  for (const [name, address] of doc.points) {
    const key = formatAddress(address);
    // 同じ番地に名前が 2 つあるときは先に書かれたほうを見出しにする
    // (名前どうしの優劣を作らない。動かすときは両方の行を直す)。
    if (!nameAt.has(key)) nameAt.set(key, name);
  }

  const found = usesOf(doc);
  // **定義しただけの名前も節点。** まだ何も来ていなくても `fb: c3` の行は
  // 書かれているので、動かせないと嘘になる (uses は 0 のまま見せる)。
  for (const address of doc.points.values()) {
    const key = formatAddress(address);
    if (!found.has(key)) found.set(key, { address, uses: 0 });
  }

  return [...found.values()]
    // 字の並びで比べると a10 が a2 より先に来る。行と列の数で並べる。
    .sort((a, b) => a.address.row - b.address.row || a.address.col - b.address.col)
    .map(({ address, uses }) => ({ address, name: nameAt.get(formatAddress(address)) ?? null, uses }));
}

/**
 * 掴める節点をフェンス本文から。**読めないフェンスでは空**にする —
 * 嘘の位置を見せると、掴めるように見えて書き換えだけが黙って失敗する。
 */
export function movableNodes(source: string): readonly NodeRef[] {
  const { doc } = parseFence(normalizeNewlines(source));
  return doc ? nodesOf(doc) : [];
}

/** 行の中の 1 つの綴り。桁は 0 始まり。 */
type Token = { readonly line: number; readonly column: number; readonly length: number };

/**
 * その番地を**素の綴りで**書いている場所を全部見つける。
 *
 * **見るのは `parts:` と `wires:` の行だけ**で、探し方は部品の移動と同じ
 * `locateTokens` — 端子の並びを左から消し込むので、値・ラベル・行末コメント・
 * `title:`・`notes:`・`style:` に番地に見える字があっても届かない
 * (YAML 全体を走査すると `circle C1 red` の C1 まで書き換えた。実際に踏んだ)。
 *
 * `points:` で付けた名前で書かれた端はここに出てこない。あちらは名前の行き先を
 * 直せば付いてくるので、綴りを触る必要がない。
 */
function bareTokens(doc: Circuit, source: string, wanted: Address): readonly Token[] {
  const lines = source.split('\n');
  const target = formatAddress(wanted);
  const found: Token[] = [];

  // **1 行に部品が 2 つ以上あることがある** (フロー形式の `parts: {R1: …, R2: …}`)。
  // 行ごとに続きの桁を覚えておかないと、同じ綴りを二度拾って後ろを取り逃す。
  const cursors = new Map<number, number>();
  for (const part of doc.parts) {
    const text = lines[part.line - 1];
    if (text === undefined) continue;
    const located = locateTokens(text, addressesOf(part), doc.points, cursors.get(part.line) ?? 0);
    if (located === null) continue;
    cursors.set(part.line, located.end);

    located.tokens.forEach((token, index) => {
      const address = addressesOf(part)[index];
      if (address === undefined || formatAddress(address) !== target) return;
      // 名前で書かれた端はここでは触らない — 名前の行き先を直せば付いてくる。
      if (parseAddress(text.slice(token.column, token.column + token.length)) === null) return;
      found.push({ line: part.line, column: token.column, length: token.length });
    });
  }

  // **配線は行の字から拾う。** 端点の並びをモデルから当てにすると、数珠つなぎと
  // フロー形式を区別できない (どちらも同じ形になる) ので、綴りが 2 つある側で
  // 片方を置き去りにする。配線の行には端点と演算子しか無いので、番地に読める
  // 綴りはすべて端点。
  for (const line of new Set(doc.wires.map((wire) => wire.line))) {
    const text = lines[line - 1];
    if (text === undefined) continue;
    for (const token of addressTokensOn(text)) {
      if (formatAddress(token.address) !== target) continue;
      found.push({ line, column: token.column, length: token.length });
    }
  }

  // 同じ場所を 2 度書き換えない (当てる範囲が重なると編集そのものが壊れる)。
  const seen = new Set<string>();
  return found.filter((token) => {
    const key = `${token.line},${token.column}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * `points:` の中で、その番地を行き先に書いている行。
 * **名前の付いた節点はここだけを直す** — 名前で指している部品と配線は
 * 綴りを変えずに付いてくるので、触る必要がない。
 *
 * `visit` ではなく直下の対をたどる。`points:` は文書の頭のマップの直下と
 * 決まっているので、入れ子の深さを当てにした探し方をしない。
 */
function pointTokens(source: string, wanted: Address): readonly Token[] {
  const lineCounter = new LineCounter();
  const document = parseDocument(source, { lineCounter, uniqueKeys: false });
  if (document.errors.length > 0 || !isMap(document.contents)) return [];

  const target = formatAddress(wanted);
  const found: Token[] = [];

  for (const pair of document.contents.items) {
    if (!isScalar(pair.key) || pair.key.value !== 'points') continue;
    if (!isMap(pair.value)) continue;

    for (const item of pair.value.items) {
      const value = item.value;
      if (!isScalar(value) || typeof value.value !== 'string' || !value.range) continue;
      const address = parseAddress(value.value.trim());
      if (address === null || formatAddress(address) !== target) continue;

      const text = source.slice(value.range[0], value.range[1]);
      const match = /\S+/.exec(text);
      if (!match) continue;
      const { line, col } = lineCounter.linePos(value.range[0] + match.index);
      found.push({ line, column: col - 1, length: match[0].length });
    }
  }

  return found;
}

/**
 * 動かすと長さ 0 になるもの。動かす先に自分のもう一方の端があると起きる。
 *
 * **これが「接続を保ったまま部品を動かす」を既定にしなかった理由の縮退**
 * そのもの (52 の docs/06 の判断の記録)。パーサも両端が同じ番地の部品を
 * 断るが、あちらは**その行を落として図を出す**ので、ここで先に見ないと
 * 「動かしたら部品が消えた」になる。
 */
function wouldSquash(doc: Circuit, at: Address, to: Address): string | null {
  const here = formatAddress(at);
  const there = formatAddress(to);
  const after = (address: Address): string =>
    (formatAddress(address) === here ? there : formatAddress(address));

  const part = doc.parts.find((one) =>
    one.kind === 'two-terminal' && after(one.from) === after(one.to));
  if (part) return part.id;

  const wire = doc.wires.find((one) => {
    const from = cellOf(one.from);
    const to2 = cellOf(one.to);
    return from !== null && to2 !== null && after(from) === after(to2);
  });
  return wire ? `${wire.line} 行目の配線` : null;
}

export function movePoint(source: string, at: Address, to: Address): MoveResult {
  const normalized = normalizeNewlines(source);
  const { doc, errors } = parseFence(normalized);
  if (!doc) return fail('フェンスを読めないので動かせません (先にエラーを直します)', null);

  if (!isOnGrid(to)) {
    return fail(`${formatAddress(at)} をそこへ動かすと格子の外へ出ます`, null);
  }
  if (formatAddress(at) === formatAddress(to)) {
    return { ok: true, value: { edits: [], diff: { lost: [], gained: [] } } };
  }

  const node = nodesOf(doc).find((one) => formatAddress(one.address) === formatAddress(at));
  if (!node) {
    return fail(`${formatAddress(at)} には動かせる節点がありません (何も書かれていません)`, null);
  }

  // **縮退は先に断る。** パーサは両端が同じ番地の行を落として図を出すので、
  // 当ててから読み直すだけでは「動かしたら部品が消えた」になる。
  const flat = wouldSquash(doc, at, to);
  if (flat !== null) {
    return fail(
      `${formatAddress(at)} を ${formatAddress(to)} へ動かすと ${flat} の両端が同じ交点になります`
      + ' (長さ 0 になって図から消えるので、先に部品のほうを動かします)',
      null,
    );
  }

  // **名前の行き先と、生の綴りで書いた場所の両方。** 名前で指している部品と
  // 配線は `points:` の 1 行に付いてくるが、同じ番地を生の綴りでも書いていたら
  // そこも運ぶ — 置いていくと接続が切れて「丸ごと運ぶ」の約束が破れる。
  const tokens = [...pointTokens(normalized, at), ...bareTokens(doc, normalized, at)];
  if (tokens.length === 0) {
    return fail(`${formatAddress(at)} を書いている場所を見つけられませんでした`, null);
  }

  const text = formatAddress(to);
  const edits: Edit[] = tokens.map((token) => ({ ...token, text }));
  const after = applyEdits(normalized, edits);
  const applied = parseFence(after);

  // 書き換えで**新しく**出たエラーだけを見る。動かす前から出ていたものは数えない。
  const was = new Set(errors.map((error) => error.message));
  const problem = applied.errors.find((error) => !was.has(error.message));
  if (problem !== undefined) {
    return fail(`${formatAddress(at)} を ${text} へ動かすと読めなくなります: ${problem.message}`, null);
  }

  // **動かし残しを黙って通さない。** 行の形が読めずに 1 か所でも取り逃すと、
  // 節点が割れて接続だけが変わる。当てたあとに古い番地が残っていたら断る。
  const remaining = applied.doc !== null
    && nodesOf(applied.doc).some((one) => formatAddress(one.address) === formatAddress(at));
  if (remaining) {
    return fail(`${formatAddress(at)} を書いている場所を全部は書き換えられませんでした (書き方を見て手で直します)`, null);
  }

  return { ok: true, value: { edits, diff: diffOf(normalized, after) } };
}
