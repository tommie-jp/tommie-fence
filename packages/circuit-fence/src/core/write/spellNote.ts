import type { NoteSpec } from '../types.ts';

/**
 * 仕様から**注釈の 1 行を組み直す** (52 の docs/54 の段 1)。
 *
 * **書かれた語をそのまま並べる。** ほかの項目 (部品・配線) は読んだ値から
 * 組み直せたが、注釈は戻せない — 色は書かなくても既定で埋まり、`box` の
 * `solid` と色は順不同、字の見た目の語も順不同で、`text` の本文は YAML の値
 * (引用するかどうかは書いた人が決める)。**読んだ値から組み直すと、
 * 書いていない語が足され、並びが変わり、引用が外れる。**
 *
 * だから注釈だけは「書かれた語の控え」(`written` / `bodyWritten`) を持ち、
 * ここはそれを並べるだけにする。書き換えるときは、**その語だけ差し替える**
 * (今の `edit/note.ts` と同じ当て方。段 3 で繋ぐ)。
 *
 * 頭の `- ` は付けない (呼ぶ側の字下げの話)。
 */
export function spellNote(note: NoteSpec): string {
  const head = [note.kind, ...note.written].join(' ');

  // `text` だけは YAML のマップ (`- text b1: 字`)。本文は書かれたまま戻す。
  return note.kind === 'text' ? `${head}: ${note.bodyWritten}` : head;
}
