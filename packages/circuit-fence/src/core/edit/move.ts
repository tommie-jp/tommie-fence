import { lineEdits } from 'fence-kit';
import type { GridStep } from 'fence-kit';
import { formatAddress, parseAddress, rowLetters } from '../model/address.ts';
import type { Address } from '../model/address.ts';
import { normalizeNewlines } from '../newlines.ts';
import { handleAt, nameOfHandle, partOfHandle } from './handles.ts';
import { parseFence } from '../parser/parseFence.ts';
import { LIMITS } from '../limits.ts';
import type { PartSpec } from '../types.ts';
import { writeFence } from '../write/writeFence.ts';
import {
  addressesOf, applyEdits, diffOf, fail, isOnGrid, keySpanOf, locatePart,
} from './shared.ts';
import type { Edit, MoveResult, Span } from './shared.ts';

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

/**
 * 掴める部品の**名札**。読めた行のぶんだけ出る。
 * 名前が重なっていなければ名前そのもの (`handles.ts`)。
 */
export function movablePartIds(source: string): readonly string[] {
  const { doc } = parseFence(normalizeNewlines(source));
  return doc ? doc.parts.map((_, index) => handleAt(doc.parts, index)) : [];
}

/** 部品のいまの番地 (アンカー)。見つからなければ null。 */
export function anchorOf(source: string, handle: string): Address | null {
  const { doc } = parseFence(normalizeNewlines(source));
  const part = partOfHandle(doc.parts, handle);
  return part ? (addressesOf(part)[0] as Address) : null;
}

export function movePart(source: string, handle: string, to: Address, trial = false): MoveResult {
  const normalized = normalizeNewlines(source);
  const { doc } = parseFence(normalized);

  const part = partOfHandle(doc.parts, handle);
  const partId = nameOfHandle(handle);
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
      `${partId} を ${formatAddress(to)} へ動かすと格子の外へ出ます` + ` (a〜${rowLetters(LIMITS.rows - 1)} の ${LIMITS.rows} 行、1〜${LIMITS.columns} 列)`,
      part.line,
    );
  }

  const lines = normalized.split('\n');
  const lineText = lines[part.line - 1];
  if (lineText === undefined) return fail(`${partId} の行が見つかりません`, part.line);

  // **フロー形式は動かさない** (欄を直すのと揃える。52 の docs/54)。1 行に部品が
  // 並ぶので行まるごと組み直すと隣の部品を消し、綴りを探す別の道を持つことになる。
  // 例にも文法リファレンスにも使われていない。図は描けるので、直すなら手で書く。
  if (sharesLine(doc.parts, part) || /^\s*parts\s*:/.test(lineText)) {
    return fail(`${partId}: フロー形式 (1 行に書いた形) の部品は動かせません。手で書きます`, part.line);
  }
  const edits = rebuiltEdits(normalized, doc, part, next, lineText);

  return {
    ok: true,
    value: { edits, diff: trial ? { lost: [], gained: [] } : diffOf(normalized, applyEdits(normalized, edits)) },
  };
}

/** **1 行に部品が並んでいる** (フロー形式 `parts: {R1: …, R2: …}`)。 */
const sharesLine = (parts: readonly PartSpec[], part: PartSpec): boolean =>
  parts.some((other) => other !== part && other.line === part.line);

/**
 * **中身を直して、その行だけ組み直す** (52 の docs/54 の段 3)。番地の綴りも
 * 動かした先に書き換える — 書かれた字下げ・語の間の空白・コメントは
 * `writeFence` が残すので、いまの当て方と同じ字になる (`write/parity.test.ts`)。
 */
function rebuiltEdits(
  source: string,
  doc: ReturnType<typeof parseFence>['doc'],
  part: PartSpec,
  next: readonly Address[],
  lineText: string,
): readonly Edit[] {
  const parts = doc.parts.map((one) => (one === part ? movedTo(part, next) : one));
  const rebuilt = writeFence(source, { ...doc, parts }, new Set([part.line]))[part.line - 1];
  return rebuilt === undefined ? [] : lineEdits(part.line, lineText, rebuilt);
}


/** 番地を差し替えた部品。**綴りも動かした先のもの**にする (`addressesOf` と同じ順)。 */
function movedTo(part: PartSpec, next: readonly Address[]): PartSpec {
  const spelling = next.map(formatAddress);
  if (part.kind === 'two-terminal') {
    return { ...part, from: next[0] as Address, to: next[1] as Address, spelling };
  }
  return { ...part, at: next[0] as Address, spelling };
}

/**
 * その部品を書いている場所 (名前と、端子の綴り)。
 *
 * マップで掴んだものをエディタで光らせるために使う。**書き換えと同じ探し方**を
 * 通すので、光る場所と動く場所が食い違わない。
 */
export function partSpans(source: string, handle: string): readonly Span[] {
  const normalized = normalizeNewlines(source);
  const { doc } = parseFence(normalized);

  const located = locatePart(doc, normalized.split('\n'), handle);
  if (located === null) return [];

  const { part, text, from, tokens } = located;
  // **鍵は名前で探す。** 名札はマップの中だけの綴りで、行には書かれていない。
  const key = keySpanOf(text, part.id, from);
  return [
    ...(key === null ? [] : [{ line: part.line, ...key }]),
    ...tokens.map((token) => ({ line: part.line, ...token })),
  ];
}


/**
 * その番地から `rows` 行・`cols` 列だけ離れた番地。格子の外は null。
 * **交点の間 (`a1a5`) からも数えられる** — 足すだけなので端数がそのまま乗る。
 */
export function stepCell(written: string, rows: number, cols: number): string | null {
  const from = parseAddress(written);
  if (from === null) return null;
  const next = { row: from.row + rows, col: from.col + cols };
  return isOnGrid(next) ? formatAddress(next) : null;
}

/**
 * 2 つの番地の間の行数と列数。**まとめて選んだものを同じだけずらす**ために要る。
 * 交点の間の番地 (`a1a5`) も引けるので、端数のまま返る。
 */
export function stepsTo(from: string, to: string): GridStep | null {
  const start = parseAddress(from);
  const end = parseAddress(to);
  return start === null || end === null ? null : { rows: end.row - start.row, cols: end.col - start.col };
}
