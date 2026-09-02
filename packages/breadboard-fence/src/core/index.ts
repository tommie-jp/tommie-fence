import { attachSourceText, fail, fenceError, notice, ok, safeToken } from './errors.ts';
import { normalizeNewlines } from './newlines.ts';
import { LIMITS } from './limits.ts';
import { formatAddress, parseAddress } from './model/address.ts';
import { createBoard, devicePinStrip, isOnBoard, offBoardReason, stripOf } from './model/board.ts';
import { createLayout } from './model/layout.ts';
import type { Layout } from './model/layout.ts';
import { computeNets } from './model/nets.ts';
import type { NetMember } from './model/nets.ts';
import { parseFence } from './parser/parseFence.ts';
import { drawnOverHoles, placeParts } from './placement/place.ts';
import { relocateParts } from './placement/relocate.ts';
import type { WireEnd } from './placement/relocate.ts';
import { routeWire, routeWires } from './router/route.ts';
import { renderDocument } from './render/document.ts';
import type { RenderedWire } from './render/document.ts';
import { layoutDevices } from './render/devices.ts';
import type { DevicePlacement } from './render/devices.ts';
import type { NoteAnchor, ResolvedNote } from './render/notes.ts';
import { partObstacles } from './render/parts.ts';
import { renderErrorBanner, renderErrorCard } from './render/errorHtml.ts';
import { DEFAULT_WIRE_COLOR, wireColor as lookupWireColor, wireColorNames } from './render/palette.ts';
import { resolveStyle } from './render/theme.ts';
import { HOLE_ROWS } from './types.ts';
import type {
  Address, Board, FenceError, Net, NoteSpec, PartSpec, PlacedPart, Point, Rect, Result, StripId, WireHint,
  WireSpec,
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
  | { readonly kind: 'hole'; readonly address: Address; readonly viaPin: boolean }
  | { readonly kind: 'device'; readonly partId: string; readonly pin: string };

type ResolvedWire = {
  readonly from: Endpoint;
  readonly to: Endpoint;
  readonly color: string;
  readonly hints: readonly WireHint[];
  /** 書かれた行 (1 始まり)。掴む印に使う (1 行 = 1 本の経路)。 */
  readonly line: number;
};

// 穴番地に `.` は現れないので、ドットを含む端点はピン参照とみなす。
// ピン名は機器の印字そのまま (`V+` `1-` など) を許す。
const PIN_REF = /^([\w-]+)\.(\S+)$/;

/**
 * フェンスの中身 1 つを図とネットリストに変換する。DOM も Node も使わない同期の純関数なので、
 * VS Code のプレビュー・CLI・サーバー側描画のどこからでも同じように呼べる。
 */
/**
 * 掴むための層に要るものを集める。**書かれている穴**に節点を立て、
 * `points:` の名前を添える (番地 → 名前。表は名前 → 番地なので裏返す)。
 */
function editLayer(
  parts: readonly PartSpec[],
  wires: readonly ResolvedWire[],
  points: ReadonlyMap<string, string>,
): { readonly used: ReadonlySet<string>; readonly names: ReadonlyMap<string, string> } {
  const used = new Set<string>();
  // **書かれた番地に節点を立てる。** 足と同じ穴へ配線が来ていると、部品のほうが
  // 同じ列の空いた行へ寄って描かれる — けれど掴んで動かすのは**書いてある綴り**
  // なので、寄った先に立てると掴んだつもりと違うものが動く (52 の docs/13)。
  for (const part of parts) {
    for (const hole of part.holes) {
      const address = parseAddress(points.get(hole.addr) ?? hole.addr);
      if (address !== null) used.add(formatAddress(address));
    }
  }
  for (const wire of wires) {
    // 機器の足は板の上に無いので、節点にはならない。
    for (const end of [wire.from, wire.to]) {
      if (end.kind === 'hole') used.add(formatAddress(end.address));
    }
  }

  // `points:` は名前 → 番地。掴んだ番地から名前を引きたいので裏返す。
  const names = new Map<string, string>();
  for (const [name, addr] of points) names.set(addr, name);
  return { used, names };
}

/** 描き方の選び (既定は今までどおり)。 */
export type RenderOptions = {
  /** 掴むための層を重ねる (マップのエディタ用)。**既定では出さない**。 */
  readonly edit?: boolean;
};

export function renderBreadboard(input: string, options: RenderOptions = {}): RenderResult {
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

  const placed = placement.parts;
  const devices = placed.filter((part) => part.kind === 'device');
  const layout = createLayout(board, {
    deviceTop: devices.some((device) => device.at !== 'bottom'),
    deviceBottom: devices.some((device) => device.at === 'bottom'),
  });

  // 配線と足が同じ穴を取り合う部品を、同じ列の空いた行へ寄せる。
  // resolveWire より前に済ませるので、ピン参照 (`Re.2`) の配線は寄せた後の穴に付く。
  const preObstacles = placed.flatMap((part) => partObstacles(part, layout, style.theme));
  const plan = planWires(parsed.doc.wires, placed, board, layout, preObstacles);
  const relocation = relocateParts(placed, plan.ends, plan.corridor);
  errors.push(...relocation.errors);
  const parts = relocation.parts;

  const wires: ResolvedWire[] = [];
  for (const spec of parsed.doc.wires) {
    const wire = resolveWire(spec, parts, board, errors);
    if (wire) wires.push(wire);
  }

  const placements = layoutDevices(devices, preferredDeviceX(wires, layout.point), layout, style.theme);

  const drawable = wires.flatMap((wire) => {
    const from = pointOf(wire.from, layout.point, placements);
    const to = pointOf(wire.to, layout.point, placements);
    return from && to ? [{ from, to, hints: wire.hints, color: wire.color, line: wire.line }] : [];
  });
  const obstacles = [
    ...parts.flatMap((part) => partObstacles(part, layout, style.theme)),
    ...[...placements.values()].map((device) => device.rect),
  ];
  // 部品の絵が載っている穴。行に沿ってまっすぐ引く配線がこの上を通らないようにする
  // (通ると、その部品にもつながっているように見える)。
  const partHoles = parts.flatMap((part) =>
    drawnOverHoles(part).map((address) => layout.point(address)));
  const rendered: RenderedWire[] = routeWires(drawable, layout, { obstacles, partHoles }).map((points, index) => ({
    points,
    color: drawable[index]?.color ?? DEFAULT_WIRE_COLOR,
    // 掴む印は書かれた行 (1 行 = 1 本の経路)。
    line: drawable[index]?.line ?? 0,
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
    edit: options.edit === true ? editLayer(parsed.doc.parts, wires, parsed.doc.points) : null,
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
    // 場所の語を書いたものは、指し先を持たない (図の外の帯に流す)。
    if (spec.place !== null) {
      resolved.push({ spec, anchors: [] });
      continue;
    }

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
    const reason = offBoardReason(board, address);
    if (reason) {
      errors.push(fenceError(reason, spec.line));
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

/** 部品の寄せ (`relocateParts`) が見る盤面: 配線が塞ぐ穴と、縦に走って通り過ぎる穴。 */
type WirePlan = { readonly ends: readonly WireEnd[]; readonly corridor: readonly Address[] };

/**
 * 配線ごとに**暫定の経路を 1 本引き**、その折れ線から端点の出口の向きと通り道の穴を読む。
 * 向きだけを規則で推測していたころは、ブロックをまたぐ直行や迂回ヒントの実際の経路と
 * ずれて、通り道に部品を寄せたり、空いている行を塞いだりしていた。
 *
 * - ピン参照 (`U1.7`) の端点は「そのピンにつなぐ」という明示なので、穴の取り合いに
 *   数えない。ただしその配線の通り道は数える (線は同じように引かれる)。
 * - 端点が解決できない配線は数えない (どのみち描かれない)。報告は resolveWire の
 *   本番の解決に任せ、ここでは黙って読み捨てる — 同じエラーを 2 度出さないため。
 * - 暫定経路は寄せる前の部品を障害物に使う。寄せた後の本番の経路とは
 *   スロット割り当てや寄り道のぶんだけずれるが、通る列と向きはほぼ変わらない。
 */
function planWires(
  specs: readonly WireSpec[],
  parts: readonly PlacedPart[],
  board: Board,
  layout: Layout,
  obstacles: readonly Rect[],
): WirePlan {
  const ends: WireEnd[] = [];
  const corridor: Address[] = [];

  for (const spec of specs) {
    const from = resolveEndpoint(spec.from, parts, board, spec.line);
    const to = resolveEndpoint(spec.to, parts, board, spec.line);
    if (!from.ok || !to.ok) continue;

    const fromPoint = endpointPoint(from.value, to.value, parts, layout);
    const toPoint = endpointPoint(to.value, from.value, parts, layout);
    const path = fromPoint && toPoint
      ? routeWire(fromPoint, toPoint, layout, { hints: spec.hints, obstacles })
      : null;
    if (path) corridor.push(...pathCorridor(path, board, layout));

    const holeEnd = (self: Endpoint, atStart: boolean): void => {
      if (self.kind !== 'hole' || self.viaPin) return;
      const otherPoint = atStart ? toPoint : fromPoint;
      ends.push({ address: self.address, ...endExit(path, atStart, layout.point(self.address), otherPoint) });
    };
    holeEnd(from.value, true);
    holeEnd(to.value, false);
  }

  return { ends, corridor };
}

type EndExit = Pick<WireEnd, 'exit' | 'away'>;

const UNKNOWN_EXIT: EndExit = { exit: 'unknown', away: null };

/**
 * 経路の端の 1 区間から、配線が端点のどちら側に付いているかを読む。
 * 縦に走らない端点 (`none`) では、反対側の端点から遠ざかる側を「見た目に良い側」とする。
 */
function endExit(
  path: readonly Point[] | null,
  atStart: boolean,
  selfPoint: Point,
  otherPoint: Point | null,
): EndExit {
  if (!path || path.length < 2 || !otherPoint) return UNKNOWN_EXIT;

  const end = atStart ? path[0]! : path[path.length - 1]!;
  const neighbor = atStart ? path[1]! : path[path.length - 2]!;
  // 隣の点が横へずれていれば、この端では縦に走らない (斜めの短いホップや横のヒント)。
  if (Math.abs(neighbor.x - end.x) > SAME_POINT_TOLERANCE || neighbor.y === end.y) {
    if (otherPoint.y === selfPoint.y) return { exit: 'none', away: null };
    return { exit: 'none', away: otherPoint.y > selfPoint.y ? 'up' : 'down' };
  }
  const exit = neighbor.y > end.y ? 'down' : 'up';
  return { exit, away: exit === 'up' ? 'down' : 'up' };
}

/** 同じ列とみなす座標の揺れ。穴は 20px 間隔なので、これで取り違えは起きない。 */
const SAME_POINT_TOLERANCE = 0.5;

/**
 * 経路の縦の区間が**通り過ぎる**穴 (両端は含まない)。
 * 寄せた部品の足がここに入ると、線が足の上を走って挿さっているように見える。
 */
function pathCorridor(path: readonly Point[], board: Board, layout: Layout): Address[] {
  const rows = HOLE_ROWS.map((row) => ({ row, y: layout.rowY(row) }));
  const holes: Address[] = [];

  for (let index = 0; index + 1 < path.length; index += 1) {
    const [a, b] = [path[index]!, path[index + 1]!];
    if (Math.abs(a.x - b.x) > SAME_POINT_TOLERANCE) continue;

    const col = Math.round((a.x - layout.colX(1)) / layout.pitch) + 1;
    if (col < 1 || col > board.columns) continue;
    if (Math.abs(layout.colX(col) - a.x) > SAME_POINT_TOLERANCE) continue;

    const low = Math.min(a.y, b.y);
    const high = Math.max(a.y, b.y);
    for (const { row, y } of rows) {
      if (y > low && y < high) holes.push({ kind: 'hole', row, col });
    }
  }

  return holes;
}

/**
 * 端点の座標。ボード外の機器はまだ箱の位置が決まっていないので、帯の中央の高さと
 * 反対側の端点の x で代える (暫定経路には上下の向きが効けばよい)。
 */
function endpointPoint(
  endpoint: Endpoint,
  other: Endpoint,
  parts: readonly PlacedPart[],
  layout: Layout,
): Point | null {
  if (endpoint.kind === 'hole') return layout.point(endpoint.address);
  const at = parts.find((part) => part.id === endpoint.partId)?.at ?? 'top';
  const band = at === 'bottom' ? layout.deviceBands.bottom : layout.deviceBands.top;
  if (!band) return null;
  const anchorX = other.kind === 'hole' ? layout.point(other.address).x : layout.colX(1);
  return { x: anchorX, y: band.y + band.height / 2 };
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

  return { from: from.value, to: to.value, color: wireColor(spec, errors), hints: spec.hints, line: spec.line };
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
      ? ok({ kind: 'hole', address: pin.address, viaPin: true })
      : ok({ kind: 'device', partId, pin: pinName });
  }

  const address = parseAddress(text);
  if (!address) return fail(`配線の端点として読めません: ${safeToken(text)}`, line, text);
  const reason = offBoardReason(board, address);
  if (reason) return fail(reason, line);
  return ok({ kind: 'hole', address, viaPin: false });
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
