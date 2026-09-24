import { computeNets } from 'fence-kit';
import type { Net, NetMember, StripId } from 'fence-kit';
import { fenceError, safeToken } from '../errors.ts';
import { hasBackGround, hasFrontGround, isOnBoard } from '../model/board.ts';
import { formatPoint, parsePoint } from '../model/point.ts';
import { GND, cutZones, islandAt } from '../geometry/islands.ts';
import type { Island } from '../geometry/islands.ts';
import { contains } from '../geometry/shapes.ts';
import type { Shape } from '../geometry/shapes.ts';
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

/** 端 (島の名前か点) を点に直す。直せなければそのわけ。 */
export function endResolver(copper: readonly CopperSpec[], parts: readonly PartSpec[]): (written: string) => Mm | string {
  const byId = new Map(copper.map((spec) => [spec.id, spec]));
  const partIds = new Set(parts.map((part) => part.id));
  return (written) => {
    const point = parsePoint(written);
    if (point !== null) return point;
    const spec = byId.get(written);
    if (spec?.kind === 'pad' || spec?.kind === 'via') return spec.at;
    if (spec?.kind === 'line') return `線路の名前は端にできません: ${safeToken(written)} (x,y で書きます)`;
    if (spec?.kind === 'slot') return `切り欠きは銅ではありません: ${safeToken(written)}`;
    if (partIds.has(written)) return `部品の名前は端にできません: ${safeToken(written)} (島の名前か x,y)`;
    return `島の名前でも点でもありません: ${safeToken(written)}`;
  };
}

export function wire(
  ground: Ground,
  shapes: readonly Shape[],
  footprints: readonly Footprint[],
  wires: readonly WireSpec[],
  resolve: (written: string) => Mm | string,
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

  const jumpers: Jumper[] = [];
  for (const spec of wires) {
    const [from, to] = [resolve(spec.from), resolve(spec.to)];
    if (typeof from === 'string' || typeof to === 'string') {
      errors.push(fenceError(typeof from === 'string' ? from : (to as string), spec.line));
      continue;
    }
    const [fromStrip, toStrip] = [at(from), at(to)];
    if (fromStrip !== null && toStrip !== null) links.push([fromStrip, toStrip]);
    jumpers.push({ from, to, color: spec.color, line: spec.line, fromStrip, toStrip });
  }

  const netlist = computeNets({
    members,
    links,
    names: ground.islands.map((island) => [island.strip, island.name] as const),
    preferredName: (strips) => (strips.includes(GND) ? 'GND' : null),
  });
  return { landings, jumpers, netlist, errors };
}

/** 点を報告に載せる綴り。 */
export const spell = (point: Mm): string => formatPoint(point);
