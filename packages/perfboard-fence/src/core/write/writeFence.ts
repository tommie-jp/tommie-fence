import { dressLine } from 'fence-kit';
import type { FenceDocument } from '../types.ts';
import { spellNote } from './spellNote.ts';
import { spellPart } from './spellPart.ts';
import { spellWire } from './spellWire.ts';

/**
 * 中身からフェンスの**本文を組み立てる** (52 の docs/54 の段 1)。
 *
 * **触っていない行は書かれた字のまま。** 組み直すのは `changed` に挙がった行だけで、
 * ほかは 1 字も動かさない。桁揃えの空白・コメント・鍵の行・空行・読めなかった行が、
 * そのまま残る。
 *
 * **なぜ「どの行を書き換えたか」を受け取るのか。** 組み直した行と書かれた行は、
 * 中身が同じでも字が違う (揃えて書くのは書いた人の手癖で、こちらは真似ない)。
 * だから「変わったかどうか」を字の比べでは決められない。**変えた側が言う。**
 *
 * 行は**フェンスの中の 1 始まり**。書き換えた行に付いていた字下げと行末の
 * コメントは、組み直した行にも残す (`dressLine`)。
 */
export function writeFence(
  source: string,
  doc: FenceDocument,
  changed: ReadonlySet<number> = new Set(),
): readonly string[] {
  const lines = source.split('\n');
  if (changed.size === 0) return lines;

  const made = new Map<number, string>();
  // 行の分からない部品 (機器は別の並び) は置き場が無いので触らない。
  for (const part of doc.parts) if (part.line !== null) made.set(part.line, spellPart(part));
  for (const note of doc.notes) if (note.line !== null) made.set(note.line, `- ${spellNote(note)}`);
  for (const wire of doc.wires) if (wire.line !== null) made.set(wire.line, `- ${spellWire(wire)}`);

  return lines.map((written, index) => {
    const line = index + 1;
    const spelled = changed.has(line) ? made.get(line) : undefined;
    return spelled === undefined ? written : dressLine(written, spelled);
  });
}
