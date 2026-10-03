import { lookupPinout, pinoutModels } from 'fence-kit';
import { notice, safeToken } from '../errors.ts';
import type { FenceError, PlacedPart } from '../types.ts';
import { footprintOf } from './footprint.ts';

/**
 * DIP の足の名前 (52 の docs/95)。**型番が fence-kit の足の名前の表にあれば**、
 * ネットリストは印字の名前で呼び、胴には番号と名前を刷る (回路図・ブレッドボードと同じ表)。
 * 変換基板 (`dip8/sop`) は中身の IC が違うので引かない。
 *
 * **1 列のヘッダ (`sip4`) も同じ表を引く** — 面実装を 1 列の変換基板に載せた物
 * (`Q1: sip4 f3 3SK291` の `Q1.G1`)。DIP と違って胴に番号は刷らず、名前だけ。
 */
export function dipPinout(part: PlacedPart): readonly string[] | null {
  const kind = footprintOf(part.type, null)?.kind;
  if (part.variant !== null || (kind !== 'dip' && kind !== 'sip')) return null;
  return lookupPinout(part.value, part.pins.length)?.names ?? null;
}

/**
 * ネットリストで呼ぶ足の名前 (0 始まりの添字)。**2 本以上に刷られた名前**
 * (TL071 の `NC`) はどの足か決まらないので番号で呼ぶ。
 */
export function dipPinName(names: readonly string[], index: number): string {
  const name = names[index] ?? `${index + 1}`;
  return names.filter((other) => other === name).length === 1 ? name : `${index + 1}`;
}

/**
 * 型番が表に無い DIP のお知らせ (回路図と同じ文面)。**エラーにはしない** — 表に無い
 * IC も番号で描ければ試せる。型番を書かない DIP は言わない。
 */
export function unnamedDipNotices(parts: readonly PlacedPart[]): FenceError[] {
  return parts.flatMap((part) => {
    if (part.variant !== null || part.value === null || footprintOf(part.type, null)?.kind !== 'dip') return [];
    if (dipPinout(part) !== null) return [];
    const known = pinoutModels(part.pins.length);
    const listed = known.length === 0
      ? `${part.type} の型番は表にありません`
      : `${part.type} で表にあるのは ${known.join(' / ')}`;
    return [notice(
      `${safeToken(part.id)} の型番 ${safeToken(part.value)} の足の名前は表に無いので、番号で描きました (${listed})`,
      part.line,
    )];
  });
}
