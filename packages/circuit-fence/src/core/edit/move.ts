import { formatAddress } from '../model/address.ts';
import type { Address } from '../model/address.ts';
import { normalizeNewlines } from '../newlines.ts';
import { parseFence } from '../parser/parseFence.ts';
import { LIMITS } from '../limits.ts';
import { addressesOf, applyEdits, diffOf, fail, isOnGrid, keySpanOf, locatePart } from './shared.ts';
import type { MoveResult, Span } from './shared.ts';

/**
 * 部品を別の番地へ動かす。**フェンス本文 -> 編集の並び**を返す純関数で、
 * vscode を知らない (設計上の約束 1)。
 *
 * **YAML を組み直さない。** 番地の綴りだけを行の中で差し替える。
 * 組み直すと手書きのコメント・整形・並び順が正規化されて、移動と関係のない
 * 差分で diff が膨れる。
 *
 * 編集の当て方とネットリストの突き合わせは `shared.ts` — **節点を動かすほうと
 * 同じものを使う** (別々に持つと、片方だけ直したときにもう片方が黙って古くなる)。
 */

export type { Edit, NetDiff } from './shared.ts';

/** 掴める部品の名前。読めないフェンスでは空。 */
export function movablePartIds(source: string): readonly string[] {
  const { doc } = parseFence(normalizeNewlines(source));
  return doc ? doc.parts.map((part) => part.id) : [];
}

/** 部品のいまの番地 (アンカー)。見つからなければ null。 */
export function anchorOf(source: string, partId: string): Address | null {
  const { doc } = parseFence(normalizeNewlines(source));
  const part = doc?.parts.find((candidate) => candidate.id === partId);
  return part ? (addressesOf(part)[0] as Address) : null;
}

export function movePart(source: string, partId: string, to: Address): MoveResult {
  const normalized = normalizeNewlines(source);
  const { doc } = parseFence(normalized);
  if (!doc) return fail('フェンスを読めないので動かせません (先にエラーを直します)', null);

  const part = doc.parts.find((candidate) => candidate.id === partId);
  if (!part) return fail(`部品が見つかりません: ${partId}`, null);

  const addresses = addressesOf(part);
  const anchor = addresses[0] as Address;
  const step = { row: to.row - anchor.row, col: to.col - anchor.col };
  if (step.row === 0 && step.col === 0) {
    return { ok: true, value: { edits: [], diff: { lost: [], gained: [] } } };
  }

  // **形を保つ。** 多端子も 2 端子も、アンカーの移動量で全部を平行移動する。
  const next = addresses.map((address) => ({ row: address.row + step.row, col: address.col + step.col }));
  const off = next.find((address) => !isOnGrid(address));
  if (off) {
    return fail(
      `${partId} を ${formatAddress(to)} へ動かすと格子の外へ出ます (a〜z の 26 行、1〜${LIMITS.columns} 列)`,
      part.line,
    );
  }

  const lines = normalized.split('\n');
  const lineText = lines[part.line - 1];
  if (lineText === undefined) return fail(`${partId} の行が見つかりません`, part.line);

  const located = locatePart(doc, lines, partId);
  if (located === null) {
    return fail(`${partId} の行から番地を見つけられませんでした`, part.line);
  }

  const edits = located.tokens.map((token, index) => ({
    line: part.line,
    column: token.column,
    length: token.length,
    text: formatAddress(next[index] as Address),
  }));

  return {
    ok: true,
    value: { edits, diff: diffOf(normalized, applyEdits(normalized, edits)) },
  };
}

/**
 * その部品を書いている場所 (名前と、端子の綴り)。
 *
 * マップで掴んだものをエディタで光らせるために使う。**書き換えと同じ探し方**を
 * 通すので、光る場所と動く場所が食い違わない。
 */
export function partSpans(source: string, partId: string): readonly Span[] {
  const normalized = normalizeNewlines(source);
  const { doc } = parseFence(normalized);
  if (!doc) return [];

  const located = locatePart(doc, normalized.split('\n'), partId);
  if (located === null) return [];

  const { part, text, from, tokens } = located;
  const key = keySpanOf(text, partId, from);
  return [
    ...(key === null ? [] : [{ line: part.line, ...key }]),
    ...tokens.map((token) => ({ line: part.line, ...token })),
  ];
}

