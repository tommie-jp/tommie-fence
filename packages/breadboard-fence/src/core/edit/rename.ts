import { RENAME_REFUSAL, applyEdits } from 'fence-kit';
import type { Edit } from 'fence-kit';
import { fenceError, safeToken } from '../errors.ts';
import { isReferenceable } from '../limits.ts';
import { normalizeNewlines } from '../newlines.ts';
import { parseFence } from '../parser/parseFence.ts';
import { devicePinSpans } from './device.ts';
import type { FieldResult } from './field.ts';

/**
 * 部品の名前を変える。**鍵と、その部品を指す注釈**を書き換える。
 *
 * 板に挿す部品の配線は書き換えない — こちらの配線は**穴を指す**ので、名前が
 * 変わっても行はそのまま正しい (circuit は `Q1.b` の形で足を指すので一緒に直す)。
 *
 * **板の外の機器だけは配線も直す。** 機器には穴が無く、配線は `AD2.V+` の形で
 * ピンを指すので、名前だけ変えると指し先を見失う (図から機器が消える)。
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

  const part = doc.parts.find((one) => one.id === from);
  if (part === undefined) return fail(`部品が見つかりません: ${safeToken(from)}`, null);
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
  const cursors = new Map<number, number>();
  for (const note of doc.notes) {
    if (!note.targets.includes(from)) continue;
    const text = lines[note.line - 1] ?? '';
    // **同じ行に先に書いた注釈の続きから探す** (`notes: [circle R1 red, circle R1 blue]`)。
    // 頭から探すと 2 つ目も 1 つ目の綴りを拾い、2 つ目の名前が古いまま残る。
    let cursor = cursors.get(note.line) ?? 0;
    for (const target of note.targets) {
      const span = spanOf(text, target, cursor);
      if (span === null) break;
      if (target === from) edits.push({ line: note.line, ...span, text: to });
      cursor = span.column + span.length;
    }
    cursors.set(note.line, cursor);
  }

  // **機器のピンを指している配線も一緒に。** `AD2.V+` の `AD2` の所だけを直す。
  if (part.type === 'device') {
    for (const span of devicePinSpans(normalized, from)) edits.push({ ...span, text: to });
  }

  if (!renamedAll(normalized, edits, from)) return fail(`${safeToken(from)}: ${RENAME_REFUSAL}`, part.line);
  // **接続は変わらない** (名前が変わるだけで、どの穴に何が挿さるかは同じ)。
  return { ok: true, value: { edits, diff: { lost: [], gained: [] } } };
}

/**
 * 書いたあと読み直して、**古い名前を指すものが残っていないか**。部品の数と YAML の
 * 構文エラーも動かないこと。取りこぼすと、注釈が黙って指し先を見失う。
 */
function renamedAll(source: string, edits: readonly Edit[], from: string): boolean {
  const before = parseFence(source);
  const after = parseFence(applyEdits(source, edits));
  const yamlErrors = (errors: readonly { readonly message: string }[]): number =>
    errors.filter((error) => error.message.startsWith('YAML')).length;
  return yamlErrors(after.errors) <= yamlErrors(before.errors)
    && after.doc.parts.length === before.doc.parts.length
    && !after.doc.parts.some((one) => one.id === from)
    && !after.doc.notes.some((note) => note.targets.includes(from));
}
