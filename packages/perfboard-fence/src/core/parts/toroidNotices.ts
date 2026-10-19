import { toroidWindingNotes } from 'fence-kit';
import { notice, safeToken } from '../errors.ts';
import type { FenceError, PlacedPart } from '../types.ts';

/**
 * トロイダルコアに巻いた物 (`/toroid`) の L の目安 (52 の docs/136)。**値が型番 + 巻数のときだけ**
 * (`FT37-43 10t`) お知らせで言う — 型番と AL の表から出した計算値で、実物は表の値からずれる。
 * 巻数が読めなければ直し方を言う。**型番だけ・インダクタンスだけの値には何も言わない。**
 * 文面は breadboard・perfboard で同じ (fence-kit)。
 */
export function toroidNotices(parts: readonly PlacedPart[]): FenceError[] {
  return parts.flatMap((part) => {
    if (part.variant !== 'toroid') return [];
    const text = toroidWindingNotes(part.type, part.value);
    return text === null ? [] : [notice(`${safeToken(part.id)}: ${text}`, part.line)];
  });
}
