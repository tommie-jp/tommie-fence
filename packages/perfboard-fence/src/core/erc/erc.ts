import type { Net } from 'fence-kit';
import { fenceError, notice, safeToken } from '../errors.ts';
import { formatAddress } from '../model/address.ts';
import { holeStrip } from '../model/board.ts';
import { pinRef } from '../wiring/wiring.ts';
import type { DeviceSpec, FenceError, PlacedPart, RoutedWire, Spelling, StripId, UnusedSpec } from '../types.ts';

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

/** 1 件の中に並べるピンの数。多ピンの IC で行が伸びきらないように切る。 */
const MAX_SHOWN_PINS = 4;

export type ErcInput = {
  readonly parts: readonly PlacedPart[];
  readonly wires: readonly RoutedWire[];
  readonly netlist: readonly Net[];
  /** `points:` で名前を付けた穴。**基板の外へ出る意思表示**として扱う。 */
  readonly namedStrips: ReadonlySet<StripId>;
  /** 基板の外の機器。ピンは盤面に無いが、つなぎ忘れは部品と同じように沈黙する。 */
  readonly devices: readonly DeviceSpec[];
  /** `unused:` に書いた、意図して使わないピン。「どこにもつながっていない」から外す。 */
  readonly unused: readonly UnusedSpec[];
  /** `shorted:` に書いた、意図して短絡した部品。短絡のお知らせから外す。 */
  readonly shorted: readonly UnusedSpec[];
  /** 番地を綴るときの基板のシルク (お知らせの穴の名前が図の端の名前と同じになる)。 */
  readonly spelling: Spelling;
};

/** つなぎ忘れを見るまとまり。部品も機器も「名前 + 端子の並び」として同じに見る。 */
type Terminals = {
  readonly id: string;
  readonly line: number | null;
  /** 端子の名前と、それがどこにあるか (穴の番地、または基板の外)。 */
  readonly pins: readonly (readonly [string, string])[];
  /** つながっていなかったときに添える一言。 */
  readonly hint: string;
};

/**
 * 未結線のピン。**ネットに自分しか乗っていないピン**は、どこにもつながっていない。
 *
 * `points:` で名前を付けた穴を含むネットは見逃す。名前を付けたのは
 * 「ここから電源や信号が出入りする」という意思表示なので、そこを
 * つなぎ忘れと言うと、正しい図が毎回叱られることになる
 * (boardwright の `external: true` にあたる)。
 */
const PART_HINT = '全穴が独立しているので、配線を書くまで挿しただけではつながりません';
const DEVICE_HINT = '基板の外の機器なので、配線を書かないとどの穴にも届きません';

const terminalsOf = (input: ErcInput): Terminals[] => [
  ...input.parts.map((part) => ({
    id: part.id,
    line: part.line,
    pins: part.pins.map((pin, index) =>
      [pinRef(part, index), formatAddress(pin.address, input.spelling)] as const),
    hint: PART_HINT,
  })),
  ...input.devices.map((device) => ({
    id: device.id,
    line: device.line,
    pins: device.pins.map((pin) => [`${device.id}.${pin}`, '基板の外'] as const),
    hint: DEVICE_HINT,
  })),
];

function unwiredPins(input: ErcInput): FenceError[] {
  const netOf = new Map<string, Net>();
  for (const net of input.netlist) {
    for (const ref of net.refs) netOf.set(ref, net);
  }

  const found: FenceError[] = [];
  const terminals = terminalsOf(input);
  const known = new Set(terminals.flatMap(({ pins }) => pins.map(([ref]) => ref)));
  const skipped = new Set(input.unused.map(({ ref }) => ref));

  // **使わないと書いたピンの矛盾を黙らせない。** 綴りの誤りは断り、実際につながっていたら言う
  // (後から配線を足したとき、古い印が嘘にならないように)。
  for (const { ref, line } of input.unused) {
    if (!known.has(ref)) {
      found.push(fenceError(`unused: に書いたピンがありません: ${safeToken(ref)}`, line, ref));
      continue;
    }
    const net = netOf.get(ref);
    const owner = ref.slice(0, ref.indexOf('.'));
    if (net && net.refs.some((other) => !other.startsWith(`${owner}.`))) {
      found.push(notice(`unused: に書いたピンがつながっています: ${safeToken(ref)}`, line, ref));
    }
  }

  for (const { id, line, pins, hint } of terminals) {
    const loose: string[] = [];
    for (const [ref, where] of pins) {
      if (skipped.has(ref)) continue;
      const net = netOf.get(ref);
      // **自分の足しか乗っていないネットは、つながっていない。** 凹の両端のように
      // 部品の中でつながったピンどうしは 1 つのネットに並ぶが、それは相手ではない。
      if (!net || net.refs.some((other) => !other.startsWith(`${id}.`))) continue;
      if (net.strips.some((strip) => input.namedStrips.has(strip))) continue;
      loose.push(`${safeToken(ref)} (${where})`);
    }
    if (loose.length === 0) continue;

    // **部品ごとに 1 件。** DIP の余ったピンは普通のことなので、1 本ずつ言うと
    // 正しい図が毎回叱られ、帯の打ち切りで本物の指摘まで押し出す。
    const shown = loose.length > MAX_SHOWN_PINS
      ? `${loose.slice(0, MAX_SHOWN_PINS).join('、')} ほか ${loose.length - MAX_SHOWN_PINS} 本`
      : loose.join('、');
    found.push(notice(
      `${safeToken(id)} の ${loose.length} 本のピンがどこにもつながっていません (${shown})。${hint}`,
      line,
    ));
  }
  return found;
}

/**
 * 短絡した部品。**両ピンが同じネットに来ている**部品は、配線で自分を跨がれている。
 *
 * boardwright の「同じ穴が 2 つのネットに属していないか」は、ここでは
 * **構造的に起き得ない** — 穴 1 つがそのまま 1 つの導通グループなので、
 * union-find が同じ穴を 2 つのネットに入れることがない。実際に起きる短絡は
 * こちらで、抵抗を入れたつもりが線で跨いでいた、という取り違えを拾う。
 */
function shortedParts(input: ErcInput): FenceError[] {
  const allowed = new Set(input.shorted.map(({ ref }) => ref));
  const rootOf = new Map<string, number>();
  for (const [index, net] of input.netlist.entries()) {
    for (const ref of net.refs) rootOf.set(ref, index);
  }

  const found: FenceError[] = [];
  // **短絡と書いた部品が短絡していなければ言う** (綴りの誤りは断る。後から線を外したとき、古い印が嘘にならない)。
  const byId = new Map(input.parts.map((part) => [part.id, part]));
  for (const { ref, line } of input.shorted) {
    const part = byId.get(ref);
    if (part === undefined) {
      found.push(fenceError(`shorted: に書いた部品がありません: ${safeToken(ref)}`, line, ref));
      continue;
    }
    const nets = part.pins.map((_, index) => rootOf.get(pinRef(part, index)));
    const first = nets[0];
    if (part.pins.length < 2 || first === undefined || !nets.every((net) => net === first)) {
      found.push(notice(`shorted: に書いた部品が短絡していません: ${safeToken(ref)}`, line, ref));
    }
  }
  for (const part of input.parts) {
    if (part.pins.length < 2) continue;
    const nets = part.pins.map((_, index) => rootOf.get(pinRef(part, index)));
    const first = nets[0];
    const isShorted = first !== undefined && nets.every((net) => net === first);
    // **意図して短絡と書いた部品は、短絡のお知らせから外す。**
    if (allowed.has(part.id)) continue;
    if (!isShorted) continue;

    found.push(notice(
      `${safeToken(part.id)} のピン ${part.pins.length} 本が全部同じネットに来ています`
      + ' (配線で短絡しています)',
      part.line,
    ));
  }
  return found;
}

/**
 * 空中配線。**部品のピンに 1 本も届いていない配線**は、何もつないでいない。
 *
 * ネットリストには出てこない (`computeNets` がピンの乗らないネットを落とす) ので、
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
      `${formatAddress(wire.from, input.spelling)} -- ${formatAddress(wire.to, input.spelling)} は部品のピンを 1 つもつないでいません`,
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
