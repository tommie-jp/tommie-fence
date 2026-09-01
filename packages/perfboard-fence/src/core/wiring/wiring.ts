import { computeNets } from 'fence-kit';
import type { Net, NetMember } from 'fence-kit';
import { fenceError, safeToken } from '../errors.ts';
import { LIMITS } from '../limits.ts';
import { formatAddress, parseAddress } from '../model/address.ts';
import { holeStrip, offBoardReason } from '../model/board.ts';
import type { Address, Board, FenceError, PlacedPart, RoutedWire, StripId, WireSpec } from '../types.ts';

export type Wiring = { readonly wires: readonly RoutedWire[]; readonly errors: readonly FenceError[] };

/**
 * 配線の端を番地に直す。名前 (`points:` で付けたもの) もここで引く。
 *
 * **読めた配線は捨てない。** 1 本落ちたら図全体が消えるより、引ける分を引いて
 * 「ここが読めなかった」と言うほうが直しやすい。
 */
export function resolveWires(
  specs: readonly WireSpec[],
  points: ReadonlyMap<string, Address>,
  board: Board,
): Wiring {
  const wires: RoutedWire[] = [];
  const errors: FenceError[] = [];

  const resolve = (written: string, line: number | null): Address | null => {
    const named = points.get(written);
    if (named !== undefined) return named;

    const address = parseAddress(written);
    if (address === null) {
      errors.push(fenceError(
        `穴の番地としても points: の名前としても読めません: ${safeToken(written)}`,
        line,
        written,
      ));
      return null;
    }
    const reason = offBoardReason(board, address);
    if (reason !== null) {
      errors.push(fenceError(reason, line, written));
      return null;
    }
    return address;
  };

  for (const spec of specs) {
    if (wires.length >= LIMITS.wires) {
      errors.push(fenceError(`配線が多すぎます (${LIMITS.wires} 本まで)`, spec.line));
      break;
    }
    const from = resolve(spec.from, spec.line);
    const to = resolve(spec.to, spec.line);
    if (from === null || to === null) continue;

    if (holeStrip(from) === holeStrip(to)) {
      // 同じ穴を結ぶ線は導通を何も足さず、図の上では点にしかならない。
      errors.push(fenceError(`配線の両端が同じ穴です (${formatAddress(from)})`, spec.line));
      continue;
    }
    wires.push({ from, to, color: spec.color, line: spec.line });
  }

  return { wires, errors };
}

/**
 * 足の名前。2 本足は 1 / 2 の順で、書いた順そのまま。
 *
 * **ネットリストと ERC で同じものを使う。** 別々に持つと、片方を直したときに
 * 突き合わせが黙って外れ、ERC が何も言わなくなる (返るのは空なのでテストも通る)。
 */
export const pinRef = (part: PlacedPart, index: number): string => `${part.id}.${index + 1}`;

const membersOf = (parts: readonly PlacedPart[]): NetMember[] =>
  parts.flatMap((part) => part.pins.map((pin, index) => ({ ref: pinRef(part, index), strip: pin.strip })));

/**
 * ネットリスト。**穴は 1 つずつ独立している**ので、つなぐのは配線だけ。
 * ブレッドボードは列の 5 穴が最初から導通していて、同じ列に挿すだけで
 * 1 つのネットになるが、ここでは配線を書かないと何もつながらない。
 *
 * 部品そのものはネットとネットの間の枝なので、足どうしはつながない。
 */
export const netlistOf = (
  parts: readonly PlacedPart[],
  wires: readonly RoutedWire[],
  points: readonly (readonly [Address, string])[],
): Net[] =>
  computeNets({
    members: membersOf(parts),
    links: wires.map((wire) => [holeStrip(wire.from), holeStrip(wire.to)] as const),
    names: points.map(([address, name]) => [holeStrip(address), name] as const),
  });

export type { Net, StripId };
