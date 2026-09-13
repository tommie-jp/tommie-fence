import { dressLine } from 'fence-kit';
import type { FenceDocument } from '../parser/parseFence.ts';
import { spellNote } from './spellNote.ts';
import { spellPart } from './spellPart.ts';
import { spellWires, wiresByLine } from './spellWire.ts';

/**
 * 中身からフェンスの**本文を組み立てる** (52 の docs/54 の段 1)。
 *
 * **触っていない行は書かれた字のまま。** 組み直すのは `changed` に挙がった行だけで、
 * ほかは 1 字も動かさない。桁揃えの空白 (`IN:  port a1`)・コメント・鍵の行・
 * 空行・読めなかった行が、そのまま残る。
 *
 * **なぜ「どの行を書き換えたか」を受け取るのか。** 組み直した行と書かれた行は、
 * 中身が同じでも字が違う (揃えて書くのは書いた人の手癖で、こちらは真似ない)。
 * だから「変わったかどうか」を字の比べでは決められない。**変えた側が言う。**
 *
 * 行は**フェンスの中の 1 始まり**。書き換えた行に付いていた字下げと行末の
 * コメントは、組み直した行にも残す。
 *
 * **本文は引数で受け取る** (`doc` からは引かない)。3 つのフェンスで同じ形に
 * するため — 板の 2 つは中身に本文を持っていない。
 */

/**
 * 書き換えた行だけを組み直した本文。`changed` が空なら**書かれたとおりの字**が返る
 * (例と文法リファレンスの全フェンスで確かめてある)。
 */
export function writeFence(
  source: string,
  doc: FenceDocument,
  changed: ReadonlySet<number> = new Set(),
): readonly string[] {
  const lines = source.split('\n');
  if (changed.size === 0) return lines;

  // 行を持ち主に配る。配線だけは 1 行に 2 本以上あるのでまとめて持つ。
  const made = new Map<number, string>();
  for (const part of doc.parts) made.set(part.line, spellPart(part));
  for (const note of doc.notes) made.set(note.line, spellNote(note));
  for (const [line, wires] of wiresByLine(doc.wires)) made.set(line, `- ${spellWires(wires)}`);

  return lines.map((written, index) => {
    const line = index + 1;
    const spelled = changed.has(line) ? made.get(line) : undefined;
    return spelled === undefined ? written : dressLine(written, spelled);
  });
}
