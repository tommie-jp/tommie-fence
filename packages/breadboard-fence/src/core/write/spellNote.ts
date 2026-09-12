import type { NoteSpec } from '../types.ts';

/**
 * 仕様から**注釈の 1 行を組み直す** (52 の docs/54 の段 1)。
 *
 * **書かれた語をそのまま並べる。** 部品や配線と違って読んだ値からは戻せない —
 * 色は書かなくても既定で埋まり、見た目の語 (bold / center / tiny …) は並びが
 * 自由で、`text` の本文は YAML の値 (引用するかどうかは書いた人が決める)。
 * 読んだ値から組み直すと、書いていない色が足され、並びが変わり、引用が外れる。
 *
 * 書き換えるときは**その語だけ差し替える** (今の `edit/note.ts` と同じ当て方)。
 * 頭の `- ` は付けない (呼ぶ側の字下げの話)。
 */
export function spellNote(note: NoteSpec): string {
  const head = note.written.join(' ');

  // 字を持つ注釈だけが YAML のマップ (`- text a5: 字`)。本文は書かれたまま戻す。
  return note.bodyWritten === null ? head : `${head}: ${note.bodyWritten}`;
}
