import { isMap, isScalar, isSeq } from 'yaml';
import { isOutsidePlace, readOutsideNote } from 'fence-kit';
import type { OutsideNote } from 'fence-kit';
import { fenceError } from '../errors.ts';
import type { FenceError } from '../types.ts';

/** 書ける注釈の数。 */
const MAX_NOTES = 20;
const HINT = 'この画面の notes: に書けるのは画面の外の字 (- text below: 字、- text above: 字) です';

/**
 * `notes:` を読む。**この画面に書けるのは画面の外 (上か下) の字だけ** (`- text below: 字`、52 の docs/157)。
 * 画面の中の注釈 (番地で置く印や字) はまだ無い。字は `\n` で改行、120 字・8 行まで (fence-kit の `readOutsideNote`)。
 */
export function readOutsideNotes(
  value: unknown, keyLine: number | null, lineOf: (node: unknown) => number | null, errors: FenceError[],
): readonly OutsideNote[] {
  if (!isSeq(value)) {
    errors.push(fenceError(`notes: は並びで書きます (${HINT})`, keyLine, 'notes'));
    return [];
  }
  const notes: OutsideNote[] = [];
  for (const item of value.items) {
    const line = lineOf(item) ?? keyLine;
    if (notes.length >= MAX_NOTES) {
      errors.push(fenceError(`注釈が多すぎます (${MAX_NOTES} 個まで)`, line));
      break;
    }
    const pair = isMap(item) && item.items.length === 1 ? item.items[0] : undefined;
    const head = pair !== undefined && isScalar(pair.key) ? String(pair.key.value) : isScalar(item) ? String(item.value) : null;
    const body = pair !== undefined && isScalar(pair.value) && pair.value.value !== null ? String(pair.value.value) : null;
    const words = (head ?? '').trim().split(/\s+/).filter((word) => word !== '');
    if (words[0] !== 'text' || !isOutsidePlace(words[1])) {
      errors.push(fenceError(HINT, line, words[0]));
      continue;
    }
    const read = readOutsideNote(words.slice(1), body);
    if (read.ok) notes.push(read.note);
    else errors.push(fenceError(read.message, line, read.token));
  }
  return notes;
}
