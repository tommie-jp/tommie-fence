import { normalizeNewlines } from '../newlines.ts';
import { parseFence } from '../parser/parseFence.ts';
import type { FenceError, NoteSpec, WireSpec } from '../types.ts';
import { diffOf, applyRewrite, fail } from './shared.ts';
import type { LineEdit, Rewrite } from './shared.ts';

/**
 * 部品と配線を消す。**フェンス本文 → 書き換えの並び**を返す純関数で、
 * vscode を知らない (設計上の約束 1)。
 *
 * **消すのは行ごと。** 1 部品 = 1 行、1 配線 = 1 本の経路という文法の読みと
 * 揃える (光る単位・帯が指す単位とも同じ)。行の中を削って詰めると、
 * 手書きのコメントや整形の残骸が行に残る。
 *
 * **フロー形式 (`parts: {…}` / `wires: [...]`) は断る。** その書き方では
 * 行が部品 1 つに対応しないので、行ごと消すと鍵まで消える。番地の差し替え
 * (`move.ts`) は今までどおり効くので、消したい人は手で消す。
 */

/** 消した結果。**一緒に消えた配線の数**を持つ (黙って消すと気づけない)。 */
export type Removal = Rewrite & { readonly wires: number };

export type RemovalResult =
  | { readonly ok: true; readonly value: Removal }
  | { readonly ok: false; readonly error: FenceError };

/** `parts:` / `wires:` の鍵の行 (1 始まり)。無ければ 0。 */
const keyLineOf = (lines: readonly string[], key: string): number =>
  lines.findIndex((text) => new RegExp(`^\\s*${key}\\s*:`).test(text)) + 1;

/** その行が鍵の行そのものか (`parts: {R1: …}` のような 1 行書き)。 */
const isKeyLine = (lineText: string | undefined, key: string): boolean =>
  lineText !== undefined && new RegExp(`^\\s*${key}\\s*:`).test(lineText);

const FLOW = 'フロー形式 (1 行に書いた形) は行ごと消せません。手で消します';

/** その配線が部品の足を指しているか。番地の端は部品と関わりが無い。 */
const touches = (wire: WireSpec, partId: string): boolean =>
  [wire.from, wire.to].some((end) => end.kind === 'pin' && end.part === partId);

/** 消す行から書き換えを組み立て、前後のネットリストを比べる。 */
function removal(source: string, drop: ReadonlySet<number>, wires: number): RemovalResult {
  const lines: readonly LineEdit[] = [...drop]
    .sort((a, b) => a - b)
    .map((line) => ({ kind: 'delete', line }));
  const rewrite = { edits: [], lines, diff: { lost: [], gained: [] } };
  return { ok: true, value: { ...rewrite, diff: diffOf(source, applyRewrite(source, rewrite)), wires } };
}

/**
 * その注釈がこの部品を指しているか。**指し先を綴りで持つ注釈だけ**が当たる
 * (番地で書いた枠は、部品が消えても指し先の升が残る)。
 */
const notePoints = (note: NoteSpec, partId: string): boolean => {
  if (note.kind === 'circle') return note.target === partId;
  if (note.kind === 'arrow' || note.kind === 'line') {
    return note.from === partId || note.to === partId;
  }
  // 枠と字と書き出しは番地で置くので、部品が消えても指し先の升は残る。
  return false;
};

export function deletePart(source: string, partId: string): RemovalResult {
  const normalized = normalizeNewlines(source);
  const { doc } = parseFence(normalized);
  if (!doc) return fail('フェンスを読めないので消せません (先にエラーを直します)', null);

  const part = doc.parts.find((candidate) => candidate.id === partId);
  if (!part) return fail(`部品が見つかりません: ${partId}`, null);

  const lines = normalized.split('\n');
  const shares = doc.parts.some((other) => other.line === part.line && other.id !== partId);
  if (shares || isKeyLine(lines[part.line - 1], 'parts')) return fail(`${partId}: ${FLOW}`, part.line);

  // 足を指す配線も一緒に消す。**残すと読めない行になるだけ** (部品はもう無い)。
  const wireLines = new Set(doc.wires.filter((wire) => touches(wire, partId)).map((wire) => wire.line));
  for (const line of wireLines) {
    if (isKeyLine(lines[line - 1], 'wires')) return fail(`${partId} の足を指す配線: ${FLOW}`, line);
  }

  // **その部品を指す注釈も一緒に消す。** 残しても指し先が無いので何も描かれず、
  // エラーもお知らせも出ない (配線を一緒に消すのと同じ理由)。
  const noteLines = new Set(doc.notes.filter((note) => notePoints(note, partId)).map((note) => note.line));
  for (const line of noteLines) {
    if (isKeyLine(lines[line - 1], 'notes')) return fail(`${partId} を指す注釈: ${FLOW}`, line);
  }

  const drop = new Set<number>([part.line, ...wireLines, ...noteLines]);
  // **最後の 1 つを消したら鍵ごと。** 空の `parts:` / `wires:` は読めない。
  if (doc.parts.every((other) => other.id === partId)) drop.add(keyLineOf(lines, 'parts'));
  if (doc.wires.length > 0 && doc.wires.every((wire) => wireLines.has(wire.line))) {
    drop.add(keyLineOf(lines, 'wires'));
  }
  if (doc.notes.length > 0 && doc.notes.every((note) => noteLines.has(note.line))) {
    drop.add(keyLineOf(lines, 'notes'));
  }
  drop.delete(0);

  return removal(normalized, drop, wireLines.size);
}

export function deleteWire(source: string, line: number): RemovalResult {
  const normalized = normalizeNewlines(source);
  const { doc } = parseFence(normalized);
  if (!doc) return fail('フェンスを読めないので消せません (先にエラーを直します)', null);

  const on = doc.wires.filter((wire) => wire.line === line);
  if (on.length === 0) return fail(`${line} 行目に配線がありません`, line);

  const lines = normalized.split('\n');
  if (isKeyLine(lines[line - 1], 'wires')) return fail(`配線: ${FLOW}`, line);

  const drop = new Set<number>([line]);
  if (doc.wires.every((wire) => wire.line === line)) drop.add(keyLineOf(lines, 'wires'));
  drop.delete(0);

  return removal(normalized, drop, on.length);
}
