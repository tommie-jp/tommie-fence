import { FLOW_REFUSAL, dropLines, isKeyLine, keyLineOf } from 'fence-kit';
import type { LineEdit, NetDiff } from 'fence-kit';
import { fenceError, safeToken } from '../errors.ts';
import { normalizeNewlines } from 'fence-kit';
import { parseFence } from '../parser/parseFence.ts';
import type { FenceError, NoteSpec } from '../types.ts';
import { diffAfterLines } from './diff.ts';

/**
 * 部品と配線を消す。**フェンス本文 → 書き換えの並び**を返す純関数。
 *
 * **消すのは行ごと。** 1 部品 = 1 行、1 配線 = 1 本の経路という文法の読みと
 * 揃える (光る単位・帯が指す単位とも同じ)。行の中を削って詰めると、
 * 手書きのコメントや整形の残骸が行に残る。
 *
 * **配線は連れていかない。** circuit は配線が部品の足を指す (`Q1.b`) ので
 * 一緒に消すが、こちらの配線は**穴を指す** — 部品が消えても行は読めるまま
 * (その穴へ行く線として意味が残る)。消すかどうかは書き手が決める。
 */

/** 消した結果。**一緒に消えた注釈の数**を持つ (黙って消すと気づけない)。 */
export type Removal = {
  readonly edits: readonly never[];
  readonly lines: readonly LineEdit[];
  readonly diff: NetDiff;
  /** 一緒に消えた行の数 (部品の行そのものを除く)。 */
  readonly wires: number;
};

export type RemovalResult =
  | { readonly ok: true; readonly value: Removal }
  | { readonly ok: false; readonly error: FenceError };

const fail = (message: string, line: number | null): RemovalResult =>
  ({ ok: false, error: fenceError(message, line) });

/**
 * その注釈がこの部品を指しているか。**指し先を綴りで持つ注釈だけ**が当たる
 * (番地で書いた枠は、部品が消えても指し先の穴が残る)。
 */
const notePoints = (note: NoteSpec, id: string): boolean => note.from === id || note.to === id;

function removal(source: string, drop: ReadonlySet<number>, extra: number): RemovalResult {
  const lines = dropLines(drop);
  return {
    ok: true,
    value: { edits: [], lines, diff: diffAfterLines(source, lines), wires: extra },
  };
}

export function deletePart(source: string, id: string): RemovalResult {
  const normalized = normalizeNewlines(source);
  const { doc } = parseFence(normalized);
  if (doc === null) return fail('フェンスを読めないので消せません (先にエラーを直します)', null);

  const part = doc.parts.find((one) => one.id === id);
  if (part === undefined) return fail(`部品が見つかりません: ${safeToken(id)}`, null);
  if (part.line === null) return fail(`${safeToken(id)} の行が分かりません`, null);

  const lines = normalized.split('\n');
  const shares = doc.parts.some((other) => other.line === part.line && other !== part);
  if (shares || isKeyLine(lines[part.line - 1], 'parts')) {
    return fail(`${safeToken(id)}: ${FLOW_REFUSAL}`, part.line);
  }

  // **その部品を指す注釈も一緒に消す。** 残しても指し先が無いので何も描かれず、
  // エラーもお知らせも出ない (黙って効かない行になる)。
  const noteLines = new Set(
    doc.notes
      .filter((note) => notePoints(note, part.id) && note.line !== null)
      .map((note) => note.line as number),
  );
  for (const line of noteLines) {
    if (isKeyLine(lines[line - 1], 'notes')) return fail(`${safeToken(id)} を指す注釈: ${FLOW_REFUSAL}`, line);
  }

  const drop = new Set<number>([part.line, ...noteLines]);
  // **最後の 1 つを消したら鍵ごと。** 空の `parts:` / `notes:` は読めない。
  if (doc.parts.length === 1) drop.add(keyLineOf(lines, 'parts'));
  if (doc.notes.length > 0 && doc.notes.every((note) => note.line !== null && noteLines.has(note.line))) {
    drop.add(keyLineOf(lines, 'notes'));
  }

  return removal(normalized, drop, noteLines.size);
}

export function deleteWire(source: string, line: number): RemovalResult {
  const normalized = normalizeNewlines(source);
  const { doc } = parseFence(normalized);
  if (doc === null) return fail('フェンスを読めないので消せません (先にエラーを直します)', null);

  const on = doc.wires.filter((wire) => wire.line === line);
  if (on.length === 0) return fail(`${line} 行目に配線がありません`, line);

  const lines = normalized.split('\n');
  if (isKeyLine(lines[line - 1], 'wires')) return fail(`配線: ${FLOW_REFUSAL}`, line);

  const drop = new Set<number>([line]);
  if (doc.wires.every((wire) => wire.line === line)) drop.add(keyLineOf(lines, 'wires'));

  return removal(normalized, drop, 0);
}
