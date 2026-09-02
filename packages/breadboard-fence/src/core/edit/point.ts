import type { Edit, NetDiff, Span } from 'fence-kit';
import { fenceError, safeToken } from '../errors.ts';
import { formatAddress, parseAddress } from '../model/address.ts';
import { createBoard } from '../model/board.ts';
import { normalizeNewlines } from '../newlines.ts';
import { parseFence, TOP_LEVEL_KEYS } from '../parser/parseFence.ts';
import { HOLE_ROWS } from '../types.ts';
import type { Address, FenceError } from '../types.ts';
import { diffAfter } from './diff.ts';
import { addressTokensOn, locateTokens } from './shared.ts';
import type { MoveResult } from './move.ts';

/**
 * 節点 (穴 1 つ) を丸ごと動かす。**そこに来ているものが全部付いてくる**ので、
 * 接続は保たれる (部品を動かすほうは 1 つだけ動いて接続が変わる)。
 *
 * `points:` で名前が付いていれば、直すのは**普通はその行き先の 1 行だけ**。
 * 名前で書いた場所は綴りを変えずに付いてくる — これが `points:` の存在理由。
 * ただし同じ穴を生の綴りでも書いていたら、そこも一緒に運ぶ
 * (置いていくと接続が切れて、「丸ごと運ぶ」の約束が破れる)。
 */

/** マップで掴める節点 1 つ。 */
export type NodeRef = {
  readonly address: Address;
  /** `points:` が付けた名前。無ければ null。 */
  readonly name: string | null;
  /** その穴を書いている場所の数。 */
  readonly uses: number;
};

const fail = (message: string, line: number | null): MoveResult =>
  ({ ok: false, error: fenceError(message, line) });

/** 書かれた 1 か所。行と桁と、綴りが名前かどうか。 */
export type Written = {
  readonly line: number;
  readonly column: number;
  readonly length: number;
  readonly address: Address;
  /** `points:` の名前で書かれているか。名前は行き先を直せば付いてくる。 */
  readonly byName: boolean;
  /** どこに書かれていたか。カーソルの引き当てが行ごとの意味を見るのに使う。 */
  readonly from: 'point' | 'part' | 'wire';
};

const isTopLevelKey = (line: string): boolean =>
  TOP_LEVEL_KEYS.some((key) => new RegExp(`^\\s*${key}\\s*:`).test(line));

/** `points:` の中の `名前: 番地` を探す。ブロック形式でもフロー形式でも同じ規則で拾う。 */
const POINT_ENTRY = /([\w-]+)\s*:\s*([^\s,}]+)/g;

/**
 * `points:` が書かれている場所。**行番号をモデルが持っていない**ので、
 * 本文から引き直す (`points:` の鍵から次の見出しまでを見る)。
 */
function pointEntries(lines: readonly string[], names: ReadonlyMap<string, string>): readonly Written[] {
  const start = lines.findIndex((line) => /^\s*points\s*:/.test(line));
  if (start < 0) return [];

  const found: Written[] = [];
  for (let index = start; index < lines.length; index += 1) {
    const text = lines[index] ?? '';
    if (index > start && isTopLevelKey(text)) break;
    // 鍵の行そのものは `points:` を拾ってしまうので、その先だけを見る。
    const from = index === start ? text.indexOf(':') + 1 : 0;

    for (const match of text.slice(from).matchAll(POINT_ENTRY)) {
      const [, name, written] = match;
      if (name === undefined || written === undefined || names.get(name) !== written) continue;
      const address = parseAddress(written);
      if (address === null) continue;
      const column = from + (match.index ?? 0) + match[0].lastIndexOf(written);
      found.push({ line: index + 1, column, length: written.length, address, byName: false, from: 'point' });
    }
  }
  return found;
}

export type Doc = {
  readonly lines: readonly string[];
  readonly written: readonly Written[];
  readonly names: ReadonlyMap<string, Address>;
  readonly columns: number;
  /** 部品ごとの穴 (縮退を見るのに使う)。 */
  readonly parts: readonly { readonly id: string; readonly line: number; readonly holes: readonly Address[] }[];
};

/**
 * 本文の中で番地が書かれている場所を全部集める。
 * **`points:` の行も部品の行も配線の行も同じ形で並ぶ** (掴む先はどれも穴)。
 */
export function scan(source: string): Doc | null {
  const normalized = normalizeNewlines(source);
  const { doc } = parseFence(normalized);
  if (doc === null) return null;

  const lines = normalized.split('\n');
  const names = new Map<string, Address>();
  for (const [name, addr] of doc.points) {
    const address = parseAddress(addr);
    if (address !== null) names.set(name, address);
  }

  const written: Written[] = [...pointEntries(lines, doc.points)];
  const parts: { id: string; line: number; holes: Address[] }[] = [];

  for (const part of doc.parts) {
    const text = lines[part.line - 1];
    if (text === undefined) continue;
    const holes: Address[] = [];
    for (const hole of part.holes) {
      const address = parseAddress(hole.addr);
      if (address !== null) holes.push(address);
    }
    if (holes.length !== part.holes.length) continue;
    parts.push({ id: part.id, line: part.line, holes });

    const located = locateTokens(text, holes, names);
    if (located === null) continue;
    for (const [index, token] of located.tokens.entries()) {
      const address = holes[index];
      if (address === undefined) continue;
      const spelling = text.slice(token.column, token.column + token.length);
      written.push({
        line: part.line,
        column: token.column,
        length: token.length,
        address,
        byName: parseAddress(spelling) === null,
        from: 'part',
      });
    }
  }

  for (const wire of doc.wires) {
    const text = lines[wire.line - 1];
    if (text === undefined) continue;
    for (const token of addressTokensOn(text, names)) {
      const spelling = text.slice(token.column, token.column + token.length);
      written.push({
        line: wire.line,
        column: token.column,
        length: token.length,
        address: token.address,
        byName: parseAddress(spelling) === null,
        from: 'wire',
      });
    }
  }

  return { lines, written, names, columns: createBoard(doc.board).columns, parts };
}

const sameAddress = (one: Address, other: Address): boolean =>
  formatAddress(one) === formatAddress(other);

/** マップで掴める節点。**何かが書かれている穴だけ**を、読み順に並べる。 */
export function movableNodes(source: string): readonly NodeRef[] {
  const doc = scan(source);
  if (doc === null) return [];

  const byAddress = new Map<string, { address: Address; uses: number }>();
  for (const one of doc.written) {
    const key = formatAddress(one.address);
    const found = byAddress.get(key);
    if (found === undefined) byAddress.set(key, { address: one.address, uses: 1 });
    else found.uses += 1;
  }

  const nameOf = new Map<string, string>();
  for (const [name, address] of doc.names) nameOf.set(formatAddress(address), name);

  const order = (address: Address): number =>
    (address.kind === 'hole' ? HOLE_ROWS.indexOf(address.row) : -1) * 1000 + address.col;

  return [...byAddress.values()]
    .sort((a, b) => order(a.address) - order(b.address))
    .map(({ address, uses }) => ({ address, name: nameOf.get(formatAddress(address)) ?? null, uses }));
}

/** その節点が書かれている場所。エディタで光らせるのに使う。 */
export function nodeSpans(source: string, at: Address): readonly Span[] {
  const doc = scan(source);
  if (doc === null) return [];

  return doc.written
    .filter((one) => sameAddress(one.address, at))
    .map((one) => ({ line: one.line, column: one.column, length: one.length }));
}

/** 動かした先。板から出るときは null。 */
function shifted(address: Address, to: Address, columns: number): Address | null {
  if (to.col < 1 || to.col > columns) return null;
  return address;
}

export function movePoint(source: string, at: Address, to: Address): MoveResult {
  const doc = scan(source);
  if (doc === null) return fail('フェンスを読めませんでした', null);

  const here = doc.written.filter((one) => sameAddress(one.address, at));
  if (here.length === 0) {
    return fail(`${formatAddress(at)} には何も書かれていません`, null);
  }
  if (sameAddress(at, to)) return { ok: true, value: { edits: [], diff: { lost: [], gained: [] } } };
  if (shifted(at, to, doc.columns) === null) {
    return fail(`${formatAddress(to)} は板の外です (列は 1〜${doc.columns})`, null);
  }

  // **縮退は断る。** 寄せた先に自分のもう一方の足がある部品は長さ 0 になり、
  // 図から消えてネットリストでは短絡になる。動かす前に名指して断る。
  for (const part of doc.parts) {
    const moves = part.holes.some((hole) => sameAddress(hole, at));
    const lands = part.holes.some((hole) => sameAddress(hole, to));
    if (moves && lands) {
      return fail(
        `${safeToken(part.id)} の足が同じ穴に重なります (先に ${safeToken(part.id)} のほうを動かします)`,
        part.line,
      );
    }
  }

  // 名前で書かれた場所は**行き先の 1 行**が動けば付いてくる。生の綴りは運ぶ。
  const written = formatAddress(to);
  const edits: Edit[] = here
    .filter((one) => !one.byName)
    .map((one) => ({ line: one.line, column: one.column, length: one.length, text: written }));

  return { ok: true, value: { edits, diff: diffAfter(source, edits) } };
}

/** その節点を書いている場所の数と名前 (お知らせに使う)。 */
export const describeNode = (node: NodeRef): string => {
  const address = formatAddress(node.address);
  return node.name === null ? address : `${address} (${node.name})`;
};

export type { NetDiff, FenceError };
