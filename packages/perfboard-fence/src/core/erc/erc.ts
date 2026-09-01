import type { Net } from 'fence-kit';
import { notice, safeToken } from '../errors.ts';
import { formatAddress } from '../model/address.ts';
import { holeStrip } from '../model/board.ts';
import { pinRef } from '../wiring/wiring.ts';
import type { FenceError, PlacedPart, RoutedWire, StripId } from '../types.ts';

/**
 * ERC — 図のとおりに組んだら動かない、という指摘。
 *
 * **ユニバーサル基板でこそ効く。** 全穴が独立しているので、部品を挿しただけでは
 * 何にもつながらず、**つなぎ忘れが図の上で沈黙する**。ブレッドボードは列が
 * 最初から導通していて、挿せば少なくとも同じ列の穴とはつながるので、
 * 同じ見落としが目に留まりやすい。
 *
 * 先行実装 boardwright から 3 項目を借りたが、**そのうち 1 つはこの盤面では
 * 構造的に起きない**ので置き換えている (下の「短絡した部品」)。
 */

/** 1 件の中に並べる足の数。多ピンの IC で行が伸びきらないように切る。 */
const MAX_SHOWN_PINS = 4;

export type ErcInput = {
  readonly parts: readonly PlacedPart[];
  readonly wires: readonly RoutedWire[];
  readonly netlist: readonly Net[];
  /** `points:` で名前を付けた穴。**基板の外へ出る意思表示**として扱う。 */
  readonly namedStrips: ReadonlySet<StripId>;
};

/**
 * 未結線のピン。**ネットに自分しか乗っていない足**は、どこにもつながっていない。
 *
 * `points:` で名前を付けた穴を含むネットは見逃す。名前を付けたのは
 * 「ここから電源や信号が出入りする」という意思表示なので、そこを
 * つなぎ忘れと言うと、正しい図が毎回叱られることになる
 * (boardwright の `external: true` にあたる)。
 */
function unwiredPins(input: ErcInput): FenceError[] {
  const netOf = new Map<string, Net>();
  for (const net of input.netlist) {
    for (const ref of net.refs) netOf.set(ref, net);
  }

  const found: FenceError[] = [];
  for (const part of input.parts) {
    const loose: string[] = [];
    for (const [index, pin] of part.pins.entries()) {
      const ref = pinRef(part, index);
      const net = netOf.get(ref);
      if (!net || net.refs.length > 1) continue;
      if (net.strips.some((strip) => input.namedStrips.has(strip))) continue;
      loose.push(`${safeToken(ref)} (${formatAddress(pin.address)})`);
    }
    if (loose.length === 0) continue;

    // **部品ごとに 1 件。** DIP の余った足は普通のことなので、1 本ずつ言うと
    // 正しい図が毎回叱られ、帯の打ち切りで本物の指摘まで押し出す。
    const shown = loose.length > MAX_SHOWN_PINS
      ? `${loose.slice(0, MAX_SHOWN_PINS).join('、')} ほか ${loose.length - MAX_SHOWN_PINS} 本`
      : loose.join('、');
    found.push(notice(
      `${safeToken(part.id)} の ${loose.length} 本の足がどこにもつながっていません (${shown})`
      + '。全穴が独立しているので、配線を書くまで挿しただけではつながりません',
      part.line,
    ));
  }
  return found;
}

/**
 * 短絡した部品。**両足が同じネットに来ている**部品は、配線で自分を跨がれている。
 *
 * boardwright の「同じ穴が 2 つのネットに属していないか」は、ここでは
 * **構造的に起き得ない** — 穴 1 つがそのまま 1 つの導通グループなので、
 * union-find が同じ穴を 2 つのネットに入れることがない。実際に起きる短絡は
 * こちらで、抵抗を入れたつもりが線で跨いでいた、という取り違えを拾う。
 */
function shortedParts(input: ErcInput): FenceError[] {
  const rootOf = new Map<string, number>();
  for (const [index, net] of input.netlist.entries()) {
    for (const ref of net.refs) rootOf.set(ref, index);
  }

  const found: FenceError[] = [];
  for (const part of input.parts) {
    if (part.pins.length < 2) continue;
    const nets = part.pins.map((_, index) => rootOf.get(pinRef(part, index)));
    const first = nets[0];
    if (first === undefined || !nets.every((net) => net === first)) continue;

    found.push(notice(
      `${safeToken(part.id)} の足 ${part.pins.length} 本が全部同じネットに来ています`
      + ' (配線で短絡しています)',
      part.line,
    ));
  }
  return found;
}

/**
 * 空中配線。**部品の足に 1 本も届いていない配線**は、何もつないでいない。
 *
 * ネットリストには出てこない (`computeNets` が足の乗らないネットを落とす) ので、
 * ここで言わないと**黙って消える**。
 */
function danglingWires(input: ErcInput): FenceError[] {
  const live = new Set<StripId>();
  for (const net of input.netlist) {
    for (const strip of net.strips) live.add(strip);
  }

  return input.wires
    .filter((wire) => !live.has(holeStrip(wire.from)) && !live.has(holeStrip(wire.to)))
    .map((wire) => notice(
      `${formatAddress(wire.from)} -- ${formatAddress(wire.to)} は部品の足を 1 つもつないでいません`,
      wire.line,
    ));
}

/**
 * **お知らせとして返す。** フェンスは読めているし、図は書かれたとおりに
 * 描けている。直さないと図が出ないものと、図のとおりに組むと動かないものとでは、
 * 次にやることが違う。
 */
export const checkErc = (input: ErcInput): FenceError[] =>
  [...unwiredPins(input), ...shortedParts(input), ...danglingWires(input)];
