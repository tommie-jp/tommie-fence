import { attachSourceText, fail, fenceError, notice, ok, safeToken } from './errors.ts';
import { normalizeNewlines } from './newlines.ts';
import { LIMITS } from './limits.ts';
import { formatAddress, parseAddress } from './model/address.ts';
import { createBoard, devicePinStrip, isOnBoard, stripOf } from './model/board.ts';
import { createLayout } from './model/layout.ts';
import type { Layout } from './model/layout.ts';
import { computeNets } from './model/nets.ts';
import type { NetMember } from './model/nets.ts';
import { parseFence } from './parser/parseFence.ts';
import { placeParts } from './placement/place.ts';
import { routeWires } from './router/route.ts';
import { renderDocument } from './render/document.ts';
import type { RenderedWire } from './render/document.ts';
import { layoutDevices } from './render/devices.ts';
import type { DevicePlacement } from './render/devices.ts';
import type { NoteAnchor, ResolvedNote } from './render/notes.ts';
import { partObstacles } from './render/parts.ts';
import { renderErrorBanner, renderErrorCard } from './render/errorHtml.ts';
import { DEFAULT_WIRE_COLOR, wireColor as lookupWireColor, wireColorNames } from './render/palette.ts';
import { resolveStyle } from './render/theme.ts';
import type {
  Address, Board, FenceError, Net, NoteSpec, PlacedPart, Point, Result, StripId, WireHint, WireSpec,
} from './types.ts';

export type RenderResult = {
  /**
   * それ自体で完結した SVG。外部リソースもスクリプトも参照しない。
   * **図が 1 つも組めなかったときは空文字列**で、言うことは `errorHtml` に入る。
   */
  readonly svg: string;
  /**
   * 穴の導通から導いたネットリスト。意図した回路との突き合わせに使える。
   * svg と違いこちらは**エスケープしていない生のデータ**なので、
   * 画面に出す側で必ずエスケープすること (React のテキスト描画ならそのままでよい)。
   */
  readonly netlist: readonly Net[];
  /** 読めなかったところ。行番号と、行の中身と、綴りを指す印を持つ。 */
  readonly errors: readonly FenceError[];
  /**
   * 読めてはいるが、思ったとおりには出ないところ。
   * `style: debug: off` で `errorHtml` からは伏せられるが、ここには必ず入る。
   */
  readonly notices: readonly FenceError[];
  /**
   * 図の下に貼る帯 (図は描けた) か、カード (図が組めなかった) の HTML。
   * 言うことが無ければ空文字列。**図の SVG には何も書き込まない**ので、
   * 書き出した SVG を貼ったときに報告が付いてこない。
   */
  readonly errorHtml: string;
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
export function renderBreadboard(input: string): RenderResult {
  // 外から来た字は、読む前に改行を揃える。行数は変わらないので行番号はそのまま。
  const source = normalizeNewlines(input);
  const parsed = parseFence(source);
  if (!parsed.doc) {
    const reported = attachSourceText(parsed.errors, source);
    return { svg: '', netlist: [], errors: reported, notices: [], errorHtml: renderErrorCard(reported) };
  }

  const errors: FenceError[] = [...parsed.errors];
  const board = createBoard(parsed.doc.board);
  const placement = placeParts(parsed.doc.parts, board);
  errors.push(...placement.errors);

  const resolved = resolveStyle(parsed.doc.style);
  const style = resolved.style;
  errors.push(...resolved.messages.map((message) => fenceError(message, parsed.doc?.style.line ?? null)));

  const parts = placement.parts;
  const devices = parts.filter((part) => part.kind === 'device');
  const layout = createLayout(board, {
    deviceTop: devices.some((device) => device.at !== 'bottom'),
    deviceBottom: devices.some((device) => device.at === 'bottom'),
  });

  const wires: ResolvedWire[] = [];
  for (const spec of parsed.doc.wires) {
    const wire = resolveWire(spec, parts, board, errors);
    if (wire) wires.push(wire);
  }

  const placements = layoutDevices(devices, preferredDeviceX(wires, layout.point), layout, style.theme);

  const drawable = wires.flatMap((wire) => {
    const from = pointOf(wire.from, layout.point, placements);
    const to = pointOf(wire.to, layout.point, placements);
    return from && to ? [{ from, to, hints: wire.hints, color: wire.color }] : [];
  });
  const obstacles = [
    ...parts.flatMap((part) => partObstacles(part, layout, style.theme)),
    ...[...placements.values()].map((device) => device.rect),
  ];
  const rendered: RenderedWire[] = routeWires(drawable, layout, obstacles).map((points, index) => ({
    points,
    color: drawable[index]?.color ?? DEFAULT_WIRE_COLOR,
  }));

  const notes = resolveNotes(parsed.doc.notes, parts, placements, board, layout, errors);

  const netlist = computeNets({
    members: netMembers(parts),
    links: [
      ...wires.map((wire) => [stripOfEndpoint(wire.from), stripOfEndpoint(wire.to)] as const),
      ...internalLinks(parts),
    ],
    names: pointStrips(parsed.doc.points, board),
  });

  const svg = renderDocument({
    title: parsed.doc.title,
    board,
    layout,
    style,
    parts,
    devices: placements,
    wires: rendered,
    notes,
    sourceLines: notes.some((note) => note.spec.kind === 'source') ? sourceListing(source) : [],
    partsList: parsed.doc.partsList,
  });

  return { svg, netlist, ...report(errors, source, style.debug) };
}

/**
 * 読めなかったところと、お知らせを分けて返す。**伏せられるのはお知らせだけ**で、
 * 読めなかった行は `debug: off` でも必ず出す (黙って消えるほうが困る)。
 */
function report(errors: readonly FenceError[], source: string, debug: boolean) {
  const reported = attachSourceText(errors, source);
  const hard = reported.filter((error) => error.notice !== true);
  const notices = reported.filter((error) => error.notice === true);
  // 読めなかった行を先に並べる。直さないと図が出ないのはこちらなので、
  // お知らせに埋もれると探すことになる (CLI の並びとも揃える)。
  const shown = debug ? [...hard, ...notices] : hard;

  return { errors: hard, notices, errorHtml: renderErrorBanner(shown) };
}

/**
 * `points:` で名前を付けた穴の導通グループを、書かれた順に返す。
 * 節点に名前を書いたなら、ネットリストにも同じ名前が出るほうが突き合わせやすい
 * (図を見ずに、書いた回路と機械的に照合する用途で効く)。
 */
function pointStrips(points: ReadonlyMap<string, string>, board: Board): (readonly [StripId, string])[] {
  return [...points].flatMap(([name, addr]) => {
    const address = parseAddress(addr);
    if (!address || !isOnBoard(board, address)) return [];
    return [[stripOf(address), name] as const];
  });
}

/**
 * `- source` が図に書き出すフェンスの中身。**行番号は添えない**:
 * この注釈の値打ちは「図を見た人がそのまま書き写せる」ことなので、
 * 番号が混ざると写したものが動かなくなる。
 */
function sourceListing(source: string): string[] {
  const lines = source.split('\n');
  while (lines.length > 0 && (lines[lines.length - 1] ?? '').trim() === '') lines.pop();

  const kept = lines.slice(0, LIMITS.sourceLines);
  if (lines.length > kept.length) kept.push(`… ほかに ${lines.length - kept.length} 行`);
  return ['```breadboard', ...kept, '```'];
}

/** 注釈 1 つぶんの、指し先を囲む形。穴 1 つならこの半径の丸になる。 */
const NOTE_HOLE_RADIUS = 11;
const NOTE_PART_PAD = 11;

function resolveNotes(
  specs: readonly NoteSpec[],
  parts: readonly PlacedPart[],
  placements: ReadonlyMap<string, DevicePlacement>,
  board: Board,
  layout: Layout,
  errors: FenceError[],
): ResolvedNote[] {
  const resolved: ResolvedNote[] = [];

  for (const spec of specs) {
    const anchors: NoteAnchor[] = [];
    let failed = false;

    for (const target of spec.targets) {
      const anchor = resolveNoteTarget(target, spec, parts, placements, board, layout, errors);
      if (!anchor) {
        failed = true;
        break;
      }
      anchors.push(anchor);
    }

    if (!failed) resolved.push({ spec, anchors });
  }

  return resolved;
}

/**
 * 指し先を図の上の形に落とす。**部品 ID を先に探し、無ければ穴番地として読む**。
 * 両方に読めるときは、どちらのつもりか分からないので添えて知らせる
 * (部品に `a5` のような名前を付けたときだけ起きる)。
 */
function resolveNoteTarget(
  target: string,
  spec: NoteSpec,
  parts: readonly PlacedPart[],
  placements: ReadonlyMap<string, DevicePlacement>,
  board: Board,
  layout: Layout,
  errors: FenceError[],
): NoteAnchor | null {
  const part = parts.find((candidate) => candidate.id === target);
  const address = parseAddress(target);

  if (part) {
    if (address) {
      errors.push(notice(
        `注釈の ${safeToken(target)} は部品を指しています (穴 ${formatAddress(address)} ではありません)`,
        spec.line,
        target,
      ));
    }
    const anchor = anchorOfPart(part, placements, layout);
    if (anchor) return anchor;
    errors.push(fenceError(`注釈の指し先 ${safeToken(target)} は図に出ていません`, spec.line));
    return null;
  }

  if (address) {
    if (!isOnBoard(board, address)) {
      errors.push(fenceError(`${formatAddress(address)} はボードの外です (1〜${board.columns} 列)`, spec.line));
      return null;
    }
    const point = layout.point(address);
    return { center: point, rx: NOTE_HOLE_RADIUS, ry: NOTE_HOLE_RADIUS, part: false };
  }

  errors.push(fenceError(`注釈の指し先 ${safeToken(target)}: そんな部品も穴もありません`, spec.line, target));
  return null;
}

function anchorOfPart(
  part: PlacedPart,
  placements: ReadonlyMap<string, DevicePlacement>,
  layout: Layout,
): NoteAnchor | null {
  const points = part.pins.flatMap((pin) => (pin.address ? [layout.point(pin.address)] : []));
  if (points.length === 0) {
    // ボード外の機器は帯の中の箱そのものを囲む。
    const rect = placements.get(part.id)?.rect;
    if (!rect) return null;
    return {
      center: { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 },
      rx: rect.width / 2 + 4,
      ry: rect.height / 2 + 4,
      part: true,
    };
  }

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);

  return {
    center: { x: (left + right) / 2, y: (top + bottom) / 2 },
    rx: (right - left) / 2 + NOTE_PART_PAD,
    ry: (bottom - top) / 2 + NOTE_PART_PAD,
    part: true,
  };
}

function netMembers(parts: readonly PlacedPart[]): NetMember[] {
  return parts.flatMap((part) =>
    part.pins.map((pin) => ({
      ref: `${part.id}.${pin.name}`,
      strip: pin.address ? stripOf(pin.address) : devicePinStrip(part.id, pin.name),
    })),
  );
}

/**
 * 部品の中で常につながっている足 (タクトスイッチの同じ側どうしなど) を、
 * 配線と同じ結び目としてネットに効かせる。ここを黙っていると、
 * **押していないのにつながっている穴**が別のネットに見えてしまう。
 */
function internalLinks(parts: readonly PlacedPart[]): (readonly [StripId, StripId])[] {
  return parts.flatMap((part) => {
    const stripOfPin = (name: string): StripId | null => {
      const pin = part.pins.find((candidate) => candidate.name === name);
      if (!pin) return null;
      return pin.address ? stripOf(pin.address) : devicePinStrip(part.id, pin.name);
    };

    return part.bridges.flatMap(([from, to]) => {
      const a = stripOfPin(from);
      const b = stripOfPin(to);
      return a && b ? [[a, b] as const] : [];
    });
  });
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
    if (!part) return fail(`配線の端点 ${safeToken(text)}: そんな部品はありません`, line, text);
    const pin = part.pins.find((candidate) => candidate.name === pinName);
    if (!pin) return fail(`配線の端点 ${safeToken(text)}: そのピンはありません${nearbyPins(part, pinName)}`, line, text);
    return pin.address
      ? ok({ kind: 'hole', address: pin.address })
      : ok({ kind: 'device', partId, pin: pinName });
  }

  const address = parseAddress(text);
  if (!address) return fail(`配線の端点として読めません: ${safeToken(text)}`, line, text);
  if (!isOnBoard(board, address)) {
    return fail(`${formatAddress(address)} はボードの外です (1〜${board.columns} 列)`, line);
  }
  return ok({ kind: 'hole', address });
}

/** 同じ書き出しのピンが 40 本並ぶ (Pico の GND) ので、書き間違いには候補を添える。 */
const MAX_PIN_HINTS = 4;

function nearbyPins(part: PlacedPart, wanted: string): string {
  const prefix = wanted.toUpperCase();
  const near = part.pins
    .filter((pin) => pin.name.toUpperCase().startsWith(prefix))
    .slice(0, MAX_PIN_HINTS)
    .map((pin) => safeToken(pin.name));

  return near.length === 0 ? '' : ` (${near.join(', ')} のことですか)`;
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
export { errorLine, errorText } from './render/errorText.ts';
export type { FenceError, Net } from './types.ts';
