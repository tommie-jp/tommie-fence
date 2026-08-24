import { fail, fenceError, ok, safeToken } from './errors.ts';
import { formatAddress, parseAddress } from './model/address.ts';
import { createBoard, devicePinStrip, isOnBoard, stripOf } from './model/board.ts';
import { createLayout } from './model/layout.ts';
import { computeNets } from './model/nets.ts';
import type { NetMember } from './model/nets.ts';
import { parseFence } from './parser/parseFence.ts';
import { placeParts } from './placement/place.ts';
import { routeWires } from './router/route.ts';
import { renderDocument } from './render/document.ts';
import type { RenderedWire } from './render/document.ts';
import { layoutDevices } from './render/devices.ts';
import { partObstacles } from './render/parts.ts';
import { renderErrorCard } from './render/errorCard.ts';
import { DEFAULT_WIRE_COLOR, wireColor as lookupWireColor, wireColorNames } from './render/palette.ts';
import type {
  Address, Board, FenceError, Net, PlacedPart, Point, Result, StripId, WireHint, WireSpec,
} from './types.ts';

export type RenderResult = {
  /** それ自体で完結した SVG。外部リソースもスクリプトも参照しない。 */
  readonly svg: string;
  /**
   * 穴の導通から導いたネットリスト。意図した回路との突き合わせに使える。
   * svg と違いこちらは**エスケープしていない生のデータ**なので、
   * 画面に出す側で必ずエスケープすること (React のテキスト描画ならそのままでよい)。
   */
  readonly netlist: readonly Net[];
  readonly errors: readonly FenceError[];
};

type Endpoint =
  | { readonly kind: 'hole'; readonly address: Address }
  | { readonly kind: 'device'; readonly partId: string; readonly pin: string };

type ResolvedWire = {
  readonly from: Endpoint;
  readonly to: Endpoint;
  readonly color: string;
  readonly hints: readonly WireHint[];
};

// 穴番地に `.` は現れないので、ドットを含む端点はピン参照とみなす。
// ピン名は機器の印字そのまま (`V+` `1-` など) を許す。
const PIN_REF = /^([\w-]+)\.(\S+)$/;

/**
 * フェンスの中身 1 つを図とネットリストに変換する。DOM も Node も使わない同期の純関数なので、
 * VS Code のプレビュー・CLI・サーバー側描画のどこからでも同じように呼べる。
 */
export function renderBreadboard(source: string): RenderResult {
  const parsed = parseFence(source);
  if (!parsed.doc) {
    return { svg: renderErrorCard(parsed.errors), netlist: [], errors: parsed.errors };
  }

  const errors: FenceError[] = [...parsed.errors];
  const board = createBoard(parsed.doc.board);
  const placement = placeParts(parsed.doc.parts, board);
  errors.push(...placement.errors);

  const parts = placement.parts;
  const devices = parts.filter((part) => part.kind === 'device');
  const layout = createLayout(board, {
    deviceTop: devices.some((device) => device.at !== 'bottom'),
    deviceBottom: devices.some((device) => device.at === 'bottom'),
  });

  const wires: ResolvedWire[] = [];
  for (const spec of parsed.doc.wires) {
    const resolved = resolveWire(spec, parts, board, errors);
    if (resolved) wires.push(resolved);
  }

  const placements = layoutDevices(devices, preferredDeviceX(wires, layout.point), layout);

  const drawable = wires.flatMap((wire) => {
    const from = pointOf(wire.from, layout.point, placements);
    const to = pointOf(wire.to, layout.point, placements);
    return from && to ? [{ from, to, hints: wire.hints, color: wire.color }] : [];
  });
  const obstacles = [
    ...parts.flatMap((part) => partObstacles(part, layout)),
    ...[...placements.values()].map((placement) => placement.rect),
  ];
  const rendered: RenderedWire[] = routeWires(drawable, layout, obstacles).map((points, index) => ({
    points,
    color: drawable[index]?.color ?? DEFAULT_WIRE_COLOR,
  }));

  const netlist = computeNets({
    members: netMembers(parts),
    links: wires.map((wire) => [stripOfEndpoint(wire.from), stripOfEndpoint(wire.to)] as const),
  });

  const svg = renderDocument({ board, layout, parts, devices: placements, wires: rendered, errors });

  return { svg, netlist, errors };
}

function netMembers(parts: readonly PlacedPart[]): NetMember[] {
  return parts.flatMap((part) =>
    part.pins.map((pin) => ({
      ref: `${part.id}.${pin.name}`,
      strip: pin.address ? stripOf(pin.address) : devicePinStrip(part.id, pin.name),
    })),
  );
}

function resolveWire(
  spec: WireSpec,
  parts: readonly PlacedPart[],
  board: Board,
  errors: FenceError[],
): ResolvedWire | null {
  const from = resolveEndpoint(spec.from, parts, board, spec.line);
  const to = resolveEndpoint(spec.to, parts, board, spec.line);
  if (!from.ok) errors.push(from.error);
  if (!to.ok) errors.push(to.error);
  if (!from.ok || !to.ok) return null;

  return { from: from.value, to: to.value, color: wireColor(spec, errors), hints: spec.hints };
}

function wireColor(spec: WireSpec, errors: FenceError[]): string {
  if (!spec.color) return DEFAULT_WIRE_COLOR;
  const color = lookupWireColor(spec.color);
  if (color) return color;
  // 未知の色名は図に書き込まない (属性への流し込みを防ぐ)。使える名前だけを示す。
  errors.push(fenceError(`知らない配線色です。使えるのは ${wireColorNames().join(', ')}`, spec.line));
  return DEFAULT_WIRE_COLOR;
}

function resolveEndpoint(
  text: string,
  parts: readonly PlacedPart[],
  board: Board,
  line: number,
): Result<Endpoint> {
  const ref = PIN_REF.exec(text);
  if (ref) {
    const [, partId = '', pinName = ''] = ref;
    const part = parts.find((candidate) => candidate.id === partId);
    if (!part) return fail(`配線の端点 ${safeToken(text)}: そんな部品はありません`, line);
    const pin = part.pins.find((candidate) => candidate.name === pinName);
    if (!pin) return fail(`配線の端点 ${safeToken(text)}: そのピンはありません`, line);
    return pin.address
      ? ok({ kind: 'hole', address: pin.address })
      : ok({ kind: 'device', partId, pin: pinName });
  }

  const address = parseAddress(text);
  if (!address) return fail(`配線の端点として読めません: ${safeToken(text)}`, line);
  if (!isOnBoard(board, address)) {
    return fail(`${formatAddress(address)} はボードの外です (1〜${board.columns} 列)`, line);
  }
  return ok({ kind: 'hole', address });
}

const stripOfEndpoint = (endpoint: Endpoint): StripId =>
  endpoint.kind === 'hole' ? stripOf(endpoint.address) : devicePinStrip(endpoint.partId, endpoint.pin);

function pointOf(
  endpoint: Endpoint,
  holePoint: (address: Address) => Point,
  placements: ReadonlyMap<string, { pins: ReadonlyMap<string, Point> }>,
): Point | null {
  if (endpoint.kind === 'hole') return holePoint(endpoint.address);
  return placements.get(endpoint.partId)?.pins.get(endpoint.pin) ?? null;
}

/** ボード外の機器は、つながる穴の平均 x に置くと配線が短くなる。 */
function preferredDeviceX(
  wires: readonly ResolvedWire[],
  holePoint: (address: Address) => Point,
): Map<string, number> {
  const columns = new Map<string, number[]>();

  for (const wire of wires) {
    for (const [self, other] of [[wire.from, wire.to], [wire.to, wire.from]] as const) {
      if (self.kind !== 'device' || other.kind !== 'hole') continue;
      const found = columns.get(self.partId);
      if (found) found.push(holePoint(other.address).x);
      else columns.set(self.partId, [holePoint(other.address).x]);
    }
  }

  return new Map(
    [...columns].map(([id, xs]) => [id, xs.reduce((sum, x) => sum + x, 0) / xs.length]),
  );
}

export { extractBreadboardFences } from './fences.ts';
export type { FenceBlock } from './fences.ts';
export { errorLine } from './render/errorCard.ts';
export type { FenceError, Net } from './types.ts';
