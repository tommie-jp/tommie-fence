import { fenceError, safeToken } from '../errors.ts';
import { LIMITS } from '../limits.ts';
import { formatAddress, parseAddress } from '../model/address.ts';
import { holeStrip, isOnBoard, offBoardReason } from '../model/board.ts';
import { footprintOf, pinsOf } from '../parts/footprint.ts';
import { isTurned } from '../parts/orient.ts';
import type { Address, Board, FenceError, PartSpec, PlacedPart, StripId } from '../types.ts';

export type Placement = { readonly parts: readonly PlacedPart[]; readonly errors: readonly FenceError[] };

/**
 * 書かれた穴を番地に直し、板に載るかを見る。
 *
 * **読めた部品は捨てない。** 1 つ落ちたら図全体が消えるより、描ける分を描いて
 * 「ここが読めなかった」と言うほうが直しやすい (48 / 49 と同じ作法)。
 *
 * **同じ穴に 2 つは置けない。** ユニバーサル基板は穴が 1 つずつ独立していて、
 * 1 つの穴に挿せる足は 1 本。ブレッドボードは同じ列の別の行へ寄せられたが
 * (48 の docs/13)、ここには寄せる先の「同じ列」が無い — 隣の穴は別のネットになる。
 */
export function placeParts(specs: readonly PartSpec[], board: Board): Placement {
  const parts: PlacedPart[] = [];
  const errors: FenceError[] = [];
  const takenBy = new Map<StripId, string>();
  const ids = new Set<string>();

  for (const spec of specs) {
    if (parts.length >= LIMITS.parts) {
      errors.push(fenceError(`部品が多すぎます (${LIMITS.parts} 個まで)`, spec.line));
      break;
    }
    if (ids.has(spec.id)) {
      // 名前が重なると、配線がどちらを指しているのか決まらない。
      errors.push(fenceError(`部品の名前が重なっています: ${safeToken(spec.id)}`, spec.line, spec.id));
      continue;
    }

    const addresses: Address[] = [];
    let rejected = false;
    for (const hole of spec.holes) {
      const address = parseAddress(hole);
      // 番地として読めることは parser が見ているので、ここで見るのは板に載るかだけ。
      const reason = address === null
        ? `穴の番地として読めません: ${safeToken(hole)}`
        : offBoardReason(board, address);
      if (address === null || reason !== null) {
        errors.push(fenceError(reason ?? '', spec.line, hole));
        rejected = true;
        break;
      }
      addresses.push(address);
    }
    if (rejected) continue;

    // **足の位置は形が決める。** DIP と SIP は書かれたアンカーから広げる。
    // 端面実装は書かなかった凹の先端を、中心線を挟んで反対側に補う。
    const footprint = footprintOf(spec.type, spec.variant);
    const pins = footprint === null ? addresses : pinsOf(footprint, addresses, board, spec.turn);
    if (footprint?.kind === 'edge' && pins.length < footprint.pins) {
      // 先端が中心導体と同じ行 (列) に書かれている。実物の凹は中心導体を
      // 上下から挟んでいて、先端が中心線に来ることは無い。
      errors.push(fenceError(
        `${safeToken(spec.id)} の凹の先端は中心導体の上下の行 (左右の列) に書きます`
        + ` (例: sma/female-edge e1 f0)`,
        spec.line,
      ));
      continue;
    }
    const offPin = pins.find((address) => offBoardReason(board, address) !== null);
    if (offPin) {
      errors.push(fenceError(
        `${safeToken(spec.id)} の足が板からはみ出します (${offBoardReason(board, offPin)})`,
        spec.line,
      ));
      continue;
    }

    // **アンカー 1 つで置く形の足は、板の穴に落ちること。**
    // 板の外の番地は穴ではない (縁の銅箔や、板から張り出す先) ので、そこへ
    // 足が来る図は実物では組めない。**回すと縁で踏みやすい**ので必ず見る
    // (端面実装は先端が板の外に出るのが正しいので、この検査から外す)。
    const anchored = footprint !== null
      && (footprint.kind === 'dip' || footprint.kind === 'sip' || footprint.kind === 'switch');
    if (anchored) {
      const outside = pins.find((address) => !isOnBoard(board, address));
      if (outside !== undefined) {
        errors.push(fenceError(
          `${safeToken(spec.id)} の足 ${formatAddress(outside)} が板の穴ではありません`
          + `${isTurned(spec.turn) ? ' (回した先が板から出ています)' : ''}`,
          spec.line,
        ));
        continue;
      }
    }

    const strips = pins.map(holeStrip);
    if (new Set(strips).size !== strips.length) {
      errors.push(fenceError(
        `${safeToken(spec.id)} の足が同じ穴に来ています (${spec.holes.map(safeToken).join(' ')})`,
        spec.line,
      ));
      continue;
    }

    const clash = strips.findIndex((strip) => takenBy.has(strip));
    if (clash !== -1) {
      const strip = strips[clash] as StripId;
      // **索引は展開後の足に当てる。** 書かれた穴は DIP / SIP では 1 つしか
      // 無いので、そちらを引くと範囲外になって投げる (プレビューが真っ白になる)。
      const address = pins[clash] as Address;
      errors.push(fenceError(
        `${formatAddress(address)} には ${takenBy.get(strip)} の足が入っています (1 つの穴に挿せる足は 1 本)`,
        spec.line,
      ));
      continue;
    }

    for (const strip of strips) takenBy.set(strip, spec.id);
    ids.add(spec.id);
    parts.push({
      id: spec.id,
      type: spec.type,
      variant: spec.variant,
      value: spec.value,
      line: spec.line,
      pins: pins.map((address) => ({ address, strip: holeStrip(address) })),
    });
  }

  return { parts, errors };
}
