import { TRIMMER_CAP_HOLES } from 'fence-kit';
import { notice, safeToken } from '../errors.ts';
import { formatAddress } from '../model/address.ts';
import type { FenceError, PlacedPart } from '../types.ts';

/**
 * トリマコンデンサ (`capacitor/trimmer`) のピンの間隔。6 mm 級のセラミックトリマは取り付け穴が 5 mm で、
 * **端子は短い板なので、抵抗のリードのように曲げて広げられない**。ブレッドボードで入るのは、同じ行で
 * 間に 1 列空けた 2 列 (`a5 a7`) だけ — 同じ列の穴は中でつながっていて、溝をまたぐと 7.62 mm になる。
 * 違えば置き方を言う。**止めない** (perfboard と同じ) — 図は書いたとおりに描く。
 */
export function trimmerNotices(parts: readonly PlacedPart[]): FenceError[] {
  return parts.flatMap((part) => {
    if (part.type !== 'capacitor' || part.variant !== 'trimmer') return [];
    const [first, second] = part.pins.map((pin) => pin.address);
    if (first === undefined || second === undefined || first === null || second === null) return [];
    const fits = first.kind === 'hole' && second.kind === 'hole'
      && first.row === second.row && Math.abs(first.col - second.col) === TRIMMER_CAP_HOLES;
    if (fits) return [];
    return [notice(
      `${safeToken(part.id)} (capacitor/trimmer) は同じ行で間に 1 列空けて (${TRIMMER_CAP_HOLES} 列離して) 挿します`
      + ` — ピンの間隔が 5 mm で、曲げて広げられません (書かれた穴: ${formatAddress(first)} ${formatAddress(second)})`,
      part.line,
    )];
  });
}
