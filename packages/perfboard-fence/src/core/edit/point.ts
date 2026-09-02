import { normalizeNewlines } from 'fence-kit';
import type { Edit, Span } from 'fence-kit';
import { fenceError, safeToken } from '../errors.ts';
import { formatAddress, parseAddress } from '../model/address.ts';
import { isOnBoard } from '../model/board.ts';
import { parseFence } from '../parser/parseFence.ts';
import type { Address, Board } from '../types.ts';
import { diffAfter } from './diff.ts';
import type { MoveResult } from './move.ts';
import { addressTokensOn, locateTokens } from './shared.ts';

/**
 * 節点 (穴 1 つ) を丸ごと動かす。**そこに来ているものが全部付いてくる**ので、
 * 接続は保たれる (部品を動かすほうは 1 つだけ動いて接続が変わる)。
 *
 * `points:` で名前が付いていれば、直すのは**普通はその行き先の 1 行だけ**。
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

/** 書かれた 1 か所。 */
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

export type Doc = {
  readonly written: readonly Written[];
  readonly names: ReadonlyMap<string, Address>;
  readonly board: Board;
  /** 部品ごとの穴 (縮退を見るのに使う)。 */
  readonly parts: readonly { readonly id: string; readonly line: number; readonly holes: readonly Address[] }[];
};

/**
 * 本文の中で穴が書かれている場所を全部集める。
 * **`points:` の行も部品の行も配線の行も同じ形で並ぶ** (掴む先はどれも穴)。
 *
 * `points:` は行番号をモデルが持っているので、本文から引き直す必要が無い
 * (breadboard は持っていないので引き直している — 揃えるならあちらを寄せる)。
 */
export function scan(source: string): Doc | null {
  const normalized = normalizeNewlines(source);
  const { doc } = parseFence(normalized);
  if (doc === null) return null;

  const lines = normalized.split('\n');
  const names = new Map<string, Address>();
  for (const point of doc.points) {
    const address = parseAddress(point.written);
    if (address !== null) names.set(point.name, address);
  }

  const written: Written[] = [];

  for (const point of doc.points) {
    const address = parseAddress(point.written);
    const text = point.line === null ? undefined : lines[point.line - 1];
    if (address === null || point.line === null || text === undefined) continue;
    const column = text.lastIndexOf(point.written);
    if (column < 0) continue;
    written.push({
      line: point.line,
      column,
      length: point.written.length,
      address,
      byName: false,
      from: 'point',
    });
  }

  const parts: { id: string; line: number; holes: Address[] }[] = [];
  for (const part of doc.parts) {
    const text = part.line === null ? undefined : lines[part.line - 1];
    if (part.line === null || text === undefined) continue;

    const holes: Address[] = [];
    for (const hole of part.holes) {
      const address = parseAddress(hole) ?? names.get(hole) ?? null;
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
    const text = wire.line === null ? undefined : lines[wire.line - 1];
    if (wire.line === null || text === undefined) continue;
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

  return { written, names, board: doc.board, parts };
}

const same = (one: Address, other: Address): boolean => one.row === other.row && one.col === other.col;

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

  return [...byAddress.values()]
    .sort((a, b) => a.address.row - b.address.row || a.address.col - b.address.col)
    .map(({ address, uses }) => ({ address, name: nameOf.get(formatAddress(address)) ?? null, uses }));
}

/** その節点が書かれている場所。エディタで光らせるのに使う。 */
export function nodeSpans(source: string, at: Address): readonly Span[] {
  const doc = scan(source);
  if (doc === null) return [];

  return doc.written
    .filter((one) => same(one.address, at))
    .map((one) => ({ line: one.line, column: one.column, length: one.length }));
}

export function movePoint(source: string, at: Address, to: Address): MoveResult {
  const doc = scan(source);
  if (doc === null) return fail('フェンスを読めませんでした', null);

  const here = doc.written.filter((one) => same(one.address, at));
  if (here.length === 0) return fail(`${formatAddress(at)} には何も書かれていません`, null);
  if (same(at, to)) return { ok: true, value: { edits: [], diff: { lost: [], gained: [] } } };
  if (!isOnBoard(doc.board, to)) return fail(`${formatAddress(to)} は板の外です`, null);

  // **縮退は断る。** 寄せた先に自分のもう一方の足がある部品は長さ 0 になり、
  // 図から消えてネットリストでは短絡になる。動かす前に名指して断る。
  for (const part of doc.parts) {
    const moves = part.holes.some((hole) => same(hole, at));
    const lands = part.holes.some((hole) => same(hole, to));
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
