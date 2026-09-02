import { formatAddress } from '../model/address.ts';
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

/**
 * 端の綴りを書き戻す編集 (綴りの長さが変わっても桁は当たる)。
 *
 * **書かれたままでよい端は触らない** (`null` を渡す)。`points:` の名前で
 * 書かれた端を番地に直すと、名前が外れて**あとで点を動かしても部品が
 * 付いてこない**。ネットの差分は空なので、何も言わずに切れる。
 */
const editsFor = (
  line: number,
  tokens: readonly { readonly column: number; readonly length: number }[],
  texts: readonly (string | null)[],
): readonly Edit[] =>
  tokens.flatMap((token, index) => {
    const text = texts[index];
    if (text === undefined || text === null) return [];
    return [{ line, column: token.column, length: token.length, text }];
  });

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
  // **一周は何もしない。** 同じ字を書き戻すと、呼ぶ側の「変わっていない」判定を
  // 素通りして、書類が汚れ・元に戻す段が積まれ・「動かしました」と言われる。
  if (to.row === part.to.row && to.col === part.to.col) return rewriteOf(normalized, []);

  // アンカーは書かれたまま (名前で書かれていれば名前のまま)。動くのは反対の端だけ。
  return rewriteOf(normalized, editsFor(part.line, tokens, [null, formatAddress(to)]));
}

export function flipPart(source: string, partId: string): RewriteResult {
  const found = twoTerminal(source, partId, '反転');
  if (!found.ok) return found;

  const { normalized, part, tokens } = found;
  if (part.kind !== 'two-terminal') return fail(`${partId} は反転できません`, part.line);

  // 端の入れ替え。**同じ 2 つの升を使う**ので、接続は変わらない (極性だけが変わる)。
  // **綴りごと入れ替える** — 番地に直すと `points:` の名前が外れる。
  const line = normalized.split('\n')[part.line - 1] ?? '';
  const spelling = (index: number): string => {
    const token = tokens[index];
    return token === undefined ? '' : line.slice(token.column, token.column + token.length);
  };

  return rewriteOf(normalized, editsFor(part.line, tokens, [spelling(1), spelling(0)]));
}
