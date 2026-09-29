import { computeNets } from 'fence-kit';
import type { Net, NetMember, StripId } from 'fence-kit';
import { fenceError, safeToken } from '../errors.ts';
import { hasBackGround, hasFrontGround, isOnBoard } from '../model/board.ts';
import { formatPoint, parsePoint, round2 } from '../model/point.ts';
import { GND, cutZones, islandAt } from '../geometry/islands.ts';
import type { Island } from '../geometry/islands.ts';
import { contains } from '../geometry/shapes.ts';
import type { Shape } from '../geometry/shapes.ts';
import type { PlacedDevice } from '../parts/device.ts';
import type { Footprint } from '../parts/footprint.ts';
import type { Board, CopperSpec, FenceError, Mm, PartSpec, RectMm, WireSpec } from '../types.ts';

/**
 * 島・地・足からネットリストを組む。**導通グループ (strip) は 3 種類**:
 * 島 (`island:L1`)、地 (`gnd`)、どこにも乗っていない足 (`pin:C1.2`)。
 * 組み立ては fence-kit の `computeNets` (盤面に依らない union-find)。
 */

/** 島どうしのジャンパを、端を点に直したもの。 */
export type Jumper = {
  readonly from: Mm;
  readonly to: Mm;
  readonly color: string | null;
  readonly line: number | null;
  readonly fromStrip: StripId | null;
  readonly toStrip: StripId | null;
  /** 板の外の機器の足につながる配線 (足の先から板の上の銅へ渡る。銅は作らない)。 */
  readonly device: boolean;
};

/** 足 1 本の行き先。**点ごと**に持つ (乗っていない点を ERC が名指すため)。 */
export type PinLanding = {
  readonly ref: string;
  readonly part: string;
  readonly pin: string;
  readonly points: readonly { readonly at: Mm; readonly strip: StripId | null }[];
  readonly shell: boolean;
  /** ネットに載せる導通グループ (乗っていなければ自分だけのもの)。 */
  readonly strip: StripId;
};

export type Wiring = {
  readonly landings: readonly PinLanding[];
  readonly jumpers: readonly Jumper[];
  readonly netlist: readonly Net[];
  readonly errors: readonly FenceError[];
  /** 配線がつながっている機器の足 (`BAT.+`)。つながっていない足を ERC が言う。 */
  readonly wiredPins: ReadonlySet<string>;
};

export type Ground = {
  readonly board: Board;
  readonly islands: readonly Island[];
  readonly slots: readonly { readonly rect: RectMm }[];
};

/** 点の導通グループ。**表が地の板では、島にも溝にも切り欠きにも無い所が地**。 */
export function stripAt(point: Mm, ground: Ground, zones: readonly RectMm[] = cutZones(ground.islands)): StripId | null {
  const island = islandAt(ground.islands, point);
  if (island !== null) return island.strip;
  if (!hasFrontGround(ground.board) || !isOnBoard(ground.board, point)) return null;
  if (zones.some((zone) => contains(zone, point, 0))) return null;
  if (ground.slots.some((slot) => contains(slot.rect, point, 0))) return null;
  return GND;
}

/** 折れ線の上で `toward` にいちばん近い点。 */
export function nearestOnPath(points: readonly Mm[], toward: Mm): Mm {
  let best: Mm = points[0] ?? toward;
  let bestDistance = Number.POSITIVE_INFINITY;
  points.slice(1).forEach((b, index) => {
    const a = points[index] ?? b;
    const [dx, dy] = [b.x - a.x, b.y - a.y];
    const length = dx * dx + dy * dy;
    const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((toward.x - a.x) * dx + (toward.y - a.y) * dy) / length));
    const candidate = { x: round2(a.x + t * dx), y: round2(a.y + t * dy) };
    const distance = Math.hypot(candidate.x - toward.x, candidate.y - toward.y);
    if (distance < bestDistance) [best, bestDistance] = [candidate, distance];
  });
  return best;
}

/**
 * 端 (島の名前か点) を点に直す。直せなければそのわけ。
 * **機器の足につなぐ配線だけは線路の名前も端にできる** — `toward` (機器の足の先) にいちばん近い
 * 線路の上の点へ渡る (線路には端が 2 つ以上あり、どこへ半田付けするかを名前だけでは決められない)。
 */
export function endResolver(
  copper: readonly CopperSpec[],
  parts: readonly PartSpec[],
): (written: string, toward?: Mm) => Mm | string {
  const byId = new Map(copper.map((spec) => [spec.id, spec]));
  const partIds = new Set(parts.map((part) => part.id));
  return (written, toward) => {
    const point = parsePoint(written);
    if (point !== null) return point;
    const spec = byId.get(written);
    if (spec?.kind === 'pad' || spec?.kind === 'via') return spec.at;
    if (spec?.kind === 'line') {
      return toward === undefined
        ? `線路の名前は端にできません: ${safeToken(written)} (x,y で書きます)`
        : nearestOnPath(spec.points, toward);
    }
    if (spec?.kind === 'slot') return `切り欠きは銅ではありません: ${safeToken(written)}`;
    if (partIds.has(written)) return `部品の名前は端にできません: ${safeToken(written)} (島の名前か x,y)`;
    return `島の名前でも点でもありません: ${safeToken(written)}`;
  };
}

/** `BAT.+` の形か (機器の足のつもりの綴り)。点 `1.5,2` は `,` を含むので当たらない。 */
const DEVICE_PIN = /^([\w-]+)\.([^\s,]+)$/;

export const devicePinStrip = (ref: string): StripId => `pin:${ref}`;

export function wire(
  ground: Ground,
  shapes: readonly Shape[],
  footprints: readonly Footprint[],
  wires: readonly WireSpec[],
  resolve: (written: string, toward?: Mm) => Mm | string,
  devices: readonly PlacedDevice[] = [],
  /** 読めなくて描かなかった機器の名前 (それにつなぐ配線は黙って飛ばす。理由は機器の側で言ってある)。 */
  skipped: ReadonlySet<string> = new Set(),
): Wiring {
  const errors: FenceError[] = [];
  const zones = cutZones(ground.islands);
  const at = (point: Mm): StripId | null => stripAt(point, ground, zones);
  const links: (readonly [StripId, StripId])[] = [];
  const members: NetMember[] = [];
  const landings: PinLanding[] = [];

  for (const footprint of footprints) {
    for (const pin of footprint.pins) {
      const ref = `${footprint.part.id}.${pin.name}`;
      if (pin.shell === true) {
        // **同軸の外皮は板の地へ付く** — 腕が縁を挟んで地に半田付けされる。
        const strip = ground.board.ground === 'none' ? `shell:${footprint.part.id}` : GND;
        members.push({ ref, strip });
        landings.push({ ref, part: footprint.part.id, pin: pin.name, points: [], shell: true, strip });
        continue;
      }
      const points = pin.points.map((point) => ({ at: point, strip: at(point) }));
      const landed = points.map((point) => point.strip).filter((strip): strip is StripId => strip !== null);
      const strip = landed[0] ?? `pin:${ref}`;
      // 1 本の足の点どうし (SOT-89 の 2 番とタブ) は同じ金物なのでつなぐ。
      for (const other of landed.slice(1)) links.push([strip, other]);
      members.push({ ref, strip });
      landings.push({ ref, part: footprint.part.id, pin: pin.name, points, shell: false, strip });
    }
  }

  // **via は島を裏の地へ落とす** (裏に地がある板だけ)。
  if (hasBackGround(ground.board)) {
    for (const shape of shapes) {
      if (shape.kind !== 'via') continue;
      const island = ground.islands.find((one) => one.members.includes(shape.id));
      if (island !== undefined) links.push([island.strip, GND]);
    }
  }

  // **機器の足は部品の足と同じくネットの一員**。配線が無ければ自分だけのネット。
  const pinTips = new Map<string, Mm>();
  for (const device of devices) {
    for (const pin of device.pins) {
      const ref = `${device.spec.id}.${pin.name}`;
      pinTips.set(ref, pin.tip);
      members.push({ ref, strip: devicePinStrip(ref) });
    }
  }
  const wired = new Set<string>();

  /** 端が機器の足なら、足の先と導通グループ。足のつもりで引けなければそのわけ (string)。 */
  const devicePin = (written: string): { at: Mm; strip: StripId } | string | null => {
    const found = DEVICE_PIN.exec(written);
    if (found === null) return null;
    const [, id = '', pin = ''] = found;
    if (skipped.has(id)) return 'skipped';
    const tip = pinTips.get(written);
    if (tip !== undefined) return { at: tip, strip: devicePinStrip(written) };
    const own = devices.find((device) => device.spec.id === id);
    if (own === undefined) return `${safeToken(written)} を機器の足として読みました。そんな機器はありません: ${safeToken(id)}`;
    return `${safeToken(id)} に ${safeToken(pin)} という足はありません (${own.pins.map((one) => safeToken(one.name)).join(' / ')})`;
  };

  const jumpers: Jumper[] = [];
  for (const spec of wires) {
    const [pinA, pinB] = [devicePin(spec.from), devicePin(spec.to)];
    if (pinA === 'skipped' || pinB === 'skipped') continue;
    if (typeof pinA === 'string' || typeof pinB === 'string') {
      const [message, written] = typeof pinA === 'string' ? [pinA, spec.from] : [pinB as string, spec.to];
      errors.push(fenceError(message, spec.line, written));
      continue;
    }
    const device = pinA !== null || pinB !== null;
    // 機器の足のもう一方の端は、足の先へ向けて解く (線路の名前なら足に近い点)。
    const from = pinA?.at ?? resolve(spec.from, pinB?.at);
    const to = pinB?.at ?? resolve(spec.to, pinA?.at);
    if (typeof from === 'string' || typeof to === 'string') {
      errors.push(fenceError(typeof from === 'string' ? from : (to as string), spec.line));
      continue;
    }
    const [fromStrip, toStrip] = [pinA?.strip ?? at(from), pinB?.strip ?? at(to)];
    if (fromStrip !== null && toStrip !== null) links.push([fromStrip, toStrip]);
    for (const [written, pin] of [[spec.from, pinA], [spec.to, pinB]] as const) if (pin !== null) wired.add(written);
    jumpers.push({ from, to, color: spec.color, line: spec.line, fromStrip, toStrip, device });
  }

  const netlist = computeNets({
    members,
    links,
    names: ground.islands.map((island) => [island.strip, island.name] as const),
    preferredName: (strips) => (strips.includes(GND) ? 'GND' : null),
  });
  return { landings, jumpers, netlist, errors, wiredPins: wired };
}

/** 点を報告に載せる綴り。 */
export const spell = (point: Mm): string => formatPoint(point);
