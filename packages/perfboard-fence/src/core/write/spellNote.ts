import type { NoteSpec } from '../types.ts';

/**
 * 仕様から**注釈の 1 行を組み直す** (52 の docs/54 の段 1)。
 *
 * **書かれた語をそのまま並べる。** 部品や配線と違って読んだ値からは戻せない —
 * 色と向きの語は並びが自由で、`text` の本文は YAML の値 (引用するかどうかは
 * 書いた人が決める)。読んだ値から組み直すと、並びが変わり、引用が外れる。
 *
 * 書き換えるときは**その語だけ差し替える** (今の `edit/note.ts` と同じ当て方)。
 * 頭の `- ` は付けない (呼ぶ側の字下げの話)。
 */
export function spellNote(note: NoteSpec): string {
  const head = note.written.join(' ');

  // `text` だけは YAML のマップ (`- text b3: 字`)。本文は書かれたまま戻す。
  return note.bodyWritten === null ? head : `${head}: ${note.bodyWritten}`;
}
