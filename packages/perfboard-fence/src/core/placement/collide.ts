import { notice, safeToken } from '../errors.ts';
import type { Layout } from '../model/layout.ts';
import { isAxial } from '../parts/types.ts';
import type { FenceError, PlacedPart } from '../types.ts';
import { formatAddress } from '../model/address.ts';
import { bodyRect, overlaps, spanOf } from './geometry.ts';

/**
 * 実物に載るかを見る。**足の穴が別でも、胴は重なる。**
 *
 * 47 の 06 メモで「Lcapy は並列部品を黙って重ねる」を弱点として挙げた以上、
 * こちらが同じことをしては筋が通らない。
 *
 * 見るのは 2 つ — 胴どうしの重なりと、実物では入らない足の間隔。
 */

/**
 * 軸物が要る最小の間隔 (穴の数)。**斜めは直線で測る**ので、隣の斜めの穴
 * (1.41) もここに掛かる — 実物でも胴が入らない距離。
 */
const MIN_AXIAL_SPAN = 2;

/**
 * 胴どうしの重なり。**組ごとに 1 件**にする (部品ごとに出すと、3 つ重なった
 * ときに同じことを 6 回言う)。
 */
function collisions(parts: readonly PlacedPart[], layout: Layout): FenceError[] {
  const rects = parts.map((part) => bodyRect(part, layout));
  const found: FenceError[] = [];

  for (let i = 0; i < parts.length; i += 1) {
    const a = rects[i];
    if (!a) continue;
    for (let j = i + 1; j < parts.length; j += 1) {
      const b = rects[j];
      if (!b || !overlaps(a, b)) continue;

      const first = parts[i] as PlacedPart;
      const second = parts[j] as PlacedPart;
      found.push(notice(
        `${safeToken(first.id)} と ${safeToken(second.id)} の胴が重なっています (実物では両方を挿せません)`,
        // **後に書いたほうの行を指す。** 重なりに気づくのは後から置いたときで、
        // 動かすのもたいていそちら。
        second.line ?? first.line,
      ));
    }
  }
  return found;
}

/**
 * 実物では入らない足の間隔。
 *
 * **軸物 (胴の両端から足が出る形) は、隣り合う穴に挿せない。** 胴そのものが
 * 2.54mm より長いため。ラジアル (足が同じ側から出る形) は、そもそも足の間隔が
 * 2.54mm で作られているので見ない。
 *
 * **上限は置いていない。** 足は伸ばせるし、部品ごとの実寸は種類だけでは
 * 決まらない (1/4W と 1/6W で胴の長さが違う)。ここで見るのは
 * **どの部品でも確実に入らない**間隔だけにしてある — 迷ったら黙るほうが、
 * 正しい図を叱るより良い。
 */
function tooTight(parts: readonly PlacedPart[]): FenceError[] {
  return parts.flatMap((part) => {
    if (!isAxial(part.type)) return [];
    const span = spanOf(part);
    if (span === null || span >= MIN_AXIAL_SPAN) return [];

    const holes = part.pins.map((pin) => formatAddress(pin.address)).join(' と ');
    return [notice(
      `${safeToken(part.id)} (${part.type}) の足の間隔が狭すぎます (${holes})`
      + '。胴の両端から足が出る部品なので、実物では入りません',
      part.line,
    )];
  });
}

export const checkFit = (parts: readonly PlacedPart[], layout: Layout): FenceError[] =>
  [...collisions(parts, layout), ...tooTight(parts)];
