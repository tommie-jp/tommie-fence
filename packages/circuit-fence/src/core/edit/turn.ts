import { formatAddress } from '../model/address.ts';
import type { Address } from '../model/address.ts';
import { normalizeNewlines } from '../newlines.ts';
import { parseFence } from '../parser/parseFence.ts';
import { LIMITS } from '../limits.ts';
import { applyRewrite, diffOf, fail, isOnGrid, locatePart } from './shared.ts';
import type { Edit, RewriteResult } from './shared.ts';

/**
 * 2 端子部品を回す・反転する。**フェンス本文 → 書き換えの並び**を返す純関数で、
 * vscode を知らない (設計上の約束 1)。
 *
 * **文法は変えない。** 2 端子部品の向きは番地の順そのものなので、回すのは
 * 「もう一方の端をアンカーの周りに 90 度動かす」、反転は「両端の入れ替え」で
 * 済む。1 端子・多端子は向きを表す語が文法に無いので断る (別の計画)。
 *
 * 番地の探し方は `move.ts` と同じ `locatePart` を通す。別々に持つと、
 * 1 行に部品が 2 つ並ぶフロー形式で片方だけが違う綴りを書き換える。
 */

/** 格子は行が下へ、列が右へ増える。時計回りは (行, 列) → (列, -行)。 */
const quarter = (row: number, col: number, clockwise: boolean): { readonly row: number; readonly col: number } =>
  (clockwise ? { row: col, col: -row } : { row: -col, col: row });

/** 90 度を `quarters` 回。正が時計回り (0 は何もしない)。 */
function spin(delta: { readonly row: number; readonly col: number }, quarters: number) {
  const times = ((quarters % 4) + 4) % 4;
  return Array.from({ length: times }).reduce<{ readonly row: number; readonly col: number }>(
    (turnedSoFar) => quarter(turnedSoFar.row, turnedSoFar.col, true),
    delta,
  );
}

/** 書き換えを組み立て、前後のネットリストを比べる。 */
function rewriteOf(source: string, edits: readonly Edit[]): RewriteResult {
  const rewrite = { edits, lines: [], diff: { lost: [], gained: [] } };
  return { ok: true, value: { ...rewrite, diff: diffOf(source, applyRewrite(source, rewrite)) } };
}

/** 2 端子部品を 1 つ取り出す。回せるのはこれだけ。 */
function twoTerminal(source: string, partId: string, what: string) {
  const normalized = normalizeNewlines(source);
  const { doc } = parseFence(normalized);
  if (!doc) return fail(`フェンスを読めないので${what}できません (先にエラーを直します)`, null);

  const part = doc.parts.find((candidate) => candidate.id === partId);
  if (!part) return fail(`部品が見つかりません: ${partId}`, null);
  if (part.kind !== 'two-terminal') {
    return fail(`${partId} は向きを書く語が文法にないので${what}できません (2 端子の部品だけ)`, part.line);
  }

  const located = locatePart(doc, normalized.split('\n'), partId);
  if (located === null) return fail(`${partId} の行から番地を見つけられませんでした`, part.line);

  return { ok: true as const, normalized, part, tokens: located.tokens };
}

/** 番地 2 つを、その部品の行に書き戻す編集 (綴りの長さが変わっても桁は当たる)。 */
const editsFor = (
  line: number,
  tokens: readonly { readonly column: number; readonly length: number }[],
  addresses: readonly Address[],
): readonly Edit[] =>
  tokens.map((token, index) => ({
    line,
    column: token.column,
    length: token.length,
    text: formatAddress(addresses[index] as Address),
  }));

export function turnPart(source: string, partId: string, quarters: number): RewriteResult {
  const found = twoTerminal(source, partId, '回');
  if (!found.ok) return found;

  const { normalized, part, tokens } = found;
  if (part.kind !== 'two-terminal') return fail(`${partId} は回せません`, part.line);

  // **アンカー (先に書いた端) は動かさない。** 動かすと「回す」が「移動」になる。
  const delta = spin({ row: part.to.row - part.from.row, col: part.to.col - part.from.col }, quarters);
  const to = { row: part.from.row + delta.row, col: part.from.col + delta.col };
  if (!isOnGrid(to)) {
    return fail(
      `${partId} を回すと格子の外へ出ます (a〜z の 26 行、1〜${LIMITS.columns} 列)`,
      part.line,
    );
  }

  return rewriteOf(normalized, editsFor(part.line, tokens, [part.from, to]));
}

export function flipPart(source: string, partId: string): RewriteResult {
  const found = twoTerminal(source, partId, '反転');
  if (!found.ok) return found;

  const { normalized, part, tokens } = found;
  if (part.kind !== 'two-terminal') return fail(`${partId} は反転できません`, part.line);

  // 端の入れ替え。**同じ 2 つの升を使う**ので、接続は変わらない (極性だけが変わる)。
  return rewriteOf(normalized, editsFor(part.line, tokens, [part.to, part.from]));
}
