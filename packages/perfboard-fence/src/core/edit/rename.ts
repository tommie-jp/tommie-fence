import { normalizeNewlines } from 'fence-kit';
import type { Edit } from 'fence-kit';
import { fenceError, safeToken } from '../errors.ts';
import { isReferenceable } from '../limits.ts';
import { parseFence } from '../parser/parseFence.ts';
import type { FieldResult } from './field.ts';

/**
 * 部品の名前を変える。**鍵と、その部品を指す注釈の両方**を書き換える。
 *
 * 配線は書き換えない — こちらの配線は**穴を指す**ので、名前が変わっても
 * 行はそのまま正しい (機器の足だけは `BAT.+` の形だが、それは機器の名前で
 * 部品の名前ではない)。
 */

const fail = (message: string, line: number | null): FieldResult =>
  ({ ok: false, error: fenceError(message, line) });

/** 行の中のその綴りの位置。語の切れ目で見る (`R1` が `R10` に当たらないように)。 */
function spanOf(text: string, word: string, from = 0): { column: number; length: number } | null {
  const pattern = new RegExp(`(^|[^\\w-])(${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})([^\\w-]|$)`);
  const found = pattern.exec(text.slice(from));
  if (found === null) return null;
  const at = from + (found.index ?? 0) + (found[1] ?? '').length;
  return { column: at, length: word.length };
}

export function renamePart(source: string, from: string, to: string): FieldResult {
  const normalized = normalizeNewlines(source);
  const { doc } = parseFence(normalized);
  if (doc === null) return fail('フェンスを読めないので変えられません (先にエラーを直します)', null);

  const part = doc.parts.find((one) => one.id === from);
  if (part === undefined) return fail(`部品が見つかりません: ${safeToken(from)}`, null);
  if (part.line === null) return fail(`${safeToken(from)} の行が分かりません`, null);
  if (from === to) return { ok: true, value: { edits: [], diff: { lost: [], gained: [] } } };

  if (!isReferenceable(to)) {
    return fail(`部品の名前に使えません: ${safeToken(to)} (英数字と _ - で書きます)`, part.line);
  }
  if (doc.parts.some((one) => one.id === to)) {
    return fail(`その名前はもう使われています: ${safeToken(to)}`, part.line);
  }

  const lines = normalized.split('\n');
  const edits: Edit[] = [];

  // 鍵 (`R1:`)。**行の頭から探す** — 値に同じ綴りがあっても鍵ではない。
  const keyLine = lines[part.line - 1] ?? '';
  const key = spanOf(keyLine, from);
  if (key === null) return fail(`${safeToken(from)} の名前を行の中に見つけられませんでした`, part.line);
  edits.push({ line: part.line, ...key, text: to });

  // **その部品を指す注釈も一緒に。** 置いていくと指し先を見失う。
  for (const note of doc.notes) {
    if (note.line === null) continue;
    const targets = [note.from, note.to].filter((one) => one !== null);
    if (!targets.includes(from)) continue;
    const text = lines[note.line - 1] ?? '';
    let cursor = 0;
    for (const target of targets) {
      const span = spanOf(text, target, cursor);
      if (span === null) break;
      if (target === from) edits.push({ line: note.line, ...span, text: to });
      cursor = span.column + span.length;
    }
  }

  // **接続は変わらない** (名前が変わるだけで、どの穴に何が挿さるかは同じ)。
  return { ok: true, value: { edits, diff: { lost: [], gained: [] } } };
}
