import { element } from '../markup.ts';
import { num, svgText } from '../svg.ts';
import { textWidth } from '../textFit.ts';
import { REAL_INK } from './ink.ts';
import type { BodyInk, BodyPart } from './ink.ts';
import { chipAlongX, dipBox, dipChip, dipOutsideNames, outsideTextStyle, sipBox, sipLegends } from './chips.ts';
import type { ChipBox, ChipInk, ChipPoint, DipOptions, SipOptions } from './chips.ts';
import type { AdapterChip } from './pinouts.ts';
import { cathodeIndex, ledLook } from './marks.ts';
import { SMD_PX_PER_MM, smdLook } from './smd.ts';
import type { ChipSpec, LeadedSpec, RowSpec, SotSpec } from './smd.ts';

/**
 * 面実装の部品の姿。**寸法は表 (`smd.ts`) の mm から描く** — `sot23` と `sot346` の
 * 違いは胴の幅 0.3mm で、比で持つと描き分けられない。
 *
 * 描くのは**上から見た姿**だけ (18 の決め: 1 つの図に視点を混ぜない)。
 * **チップの印字 (`103` など) は描かない** — 2012 の胴は 16 × 10px で、字が読めない。
 */

const MM = SMD_PX_PER_MM;


/** 電極とピンの金物。 */
const METAL = '#c9ced6';
const METAL_EDGE = '#7c848e';
/** 樹脂 (SOT・SOD)。差し込み型の TO-92 と同じ黒。 */
const RESIN = '#23272e';
const RESIN_EDGE = '#12151a';

/** チップの胴の色。**抵抗は黒 (抵抗体の保護膜)、コンデンサは素地の茶、LED は白い樹脂**。 */
const CHIP_FACE: Readonly<Record<string, { readonly fill: string; readonly edge: string }>> = {
  resistor: { fill: '#1c1f24', edge: '#0b0d10' },
  capacitor: { fill: '#b08457', edge: '#7a5a38' },
  led: { fill: '#eeeae0', edge: '#a8a294' },
};

/** 電極の長さの、全長に対する比 (実物の 1608〜3216 で 0.2 前後)。 */
const CAP_RATIO = 0.2;
/** LED のカソードの印 (実物は緑の線や T 字)。 */
const LED_CATHODE = '#2f8f4e';
/** ダイオードのカソード帯。 */
const DIODE_BAND = '#dfe4ee';

type Size = { readonly width: number; readonly height: number };

const rect = (x: number, y: number, width: number, height: number, attrs: Record<string, string | number>): string =>
  element('rect', { x: num(x), y: num(y), width: num(width), height: num(height), ...attrs });

/** 直付けの 2 ピン (チップ・SOD) の表。それ以外は null。 */
function twoLeadSpec(part: BodyPart): ChipSpec | LeadedSpec | null {
  const look = smdLook(part.variant ?? null);
  if (look === null || look.onAdapter) return null;
  return look.spec.kind === 'chip' || look.spec.kind === 'leaded' ? look.spec : null;
}

/**
 * 直付けの 2 ピンの外形 (px)。**ピンの間隔では伸び縮みしない** (実物の寸法)。
 * 面実装の姿でなければ null — 呼ぶ側 (`bodySize`) が差し込み型の数式に戻る。
 */
export function smdBodySize(part: BodyPart): Size | null {
  const spec = twoLeadSpec(part);
  if (spec === null) return null;
  if (spec.kind === 'chip') return { width: spec.length * MM, height: spec.width * MM };
  return { width: spec.span * MM, height: spec.width * MM };
}

/**
 * 直付けの 2 ピンの胴。座標は `bodies.ts` と同じ「原点が中央・x 軸がピンの向き」。
 * 面実装の姿でなければ null。
 */
export function drawSmdBody(part: BodyPart, ink: BodyInk = REAL_INK): string | null {
  const spec = twoLeadSpec(part);
  if (spec === null) return null;
  return spec.kind === 'chip' ? chipBody(part, spec, ink) : leadedBody(part, spec, ink);
}

/** チップ。**両端の電極が金物**で、そこが基板のランドに半田付けされる。 */
function chipBody(part: BodyPart, spec: ChipSpec, ink: BodyInk): string {
  const length = spec.length * MM;
  const width = spec.width * MM;
  const cap = length * CAP_RATIO;
  const face = CHIP_FACE[part.type] ?? CHIP_FACE['resistor']!;
  const body = rect(-length / 2, -width / 2, length, width, {
    rx: 0.6, fill: ink.paint(face.fill), stroke: ink.paint(face.edge), 'stroke-width': 0.6,
  });
  const caps = [-1, 1]
    .map((side) => rect(side < 0 ? -length / 2 : length / 2 - cap, -width / 2, cap, width, {
      fill: ink.paint(METAL), stroke: ink.paint(METAL_EDGE), 'stroke-width': 0.5,
    }))
    .join('');
  return body + caps + (part.type === 'led' ? ledFace(part, length, width, cap, ink) : '');
}

/**
 * チップ LED の窓と、カソードの印。**向きは砲弾型と同じ規則**
 * (印が無ければ後に書いた穴がカソード)。
 */
function ledFace(part: BodyPart, length: number, width: number, cap: number, ink: BodyInk): string {
  const { color, name } = ledLook(part);
  const inner = length / 2 - cap;
  const window = rect(-inner + 0.6, -width * 0.32, inner * 2 - 1.2, width * 0.64, {
    rx: 0.8, fill: ink.paint(color, name), 'fill-opacity': 0.85,
  });
  const at = (cathodeIndex(part) === 0 ? -1 : 1) * (inner - 1);
  const mark = rect(at - 0.6, -width / 2, 1.2, width, { fill: ink.paint(LED_CATHODE) });
  return window + mark;
}

/**
 * 樹脂の胴から平たいピンが出るダイオード。**カソード帯は差し込み型と同じ側**
 * (印が無ければ後に書いた穴)。ピンは胴の下から出て、両端でランドに載る。
 */
function leadedBody(part: BodyPart, spec: LeadedSpec, ink: BodyInk): string {
  const length = spec.length * MM;
  const width = spec.width * MM;
  const span = spec.span * MM;
  const lead = spec.lead * MM;
  const leads = rect(-span / 2, -lead / 2, span, lead, {
    fill: ink.paint(METAL), stroke: ink.paint(METAL_EDGE), 'stroke-width': 0.5,
  });
  const body = rect(-length / 2, -width / 2, length, width, {
    rx: 0.8, fill: ink.paint(RESIN), stroke: ink.paint(RESIN_EDGE), 'stroke-width': 0.6,
  });
  const bandWidth = Math.max(length * 0.12, 1.2);
  const at = (cathodeIndex(part) === 0 ? -1 : 1) * (length / 2 - bandWidth * 1.4);
  const band = rect(at - bandWidth / 2, -width / 2, bandWidth, width, { fill: ink.paint(DIODE_BAND) });
  return leads + body + band;
}

/** SOT-89 の放熱タブが胴から出る長さと、タブの幅 (mm)。 */
const TAB_OUT = 0.6;
const TAB_WIDTH = 1.7;
/** SOT のピンの幅 (mm)。SOT-89 の真ん中のピンだけ太い。 */
const SOT_LEAD = 0.4;
const SOT89_MIDDLE = 0.53;

/**
 * SOT の胴とピン。**原点が胴の中心、1 番と 2 番のピンが -y の側、3 番が +y の側**
 * (1 番が -x)。SOT-89 は 3 本とも -y に並び、+y にタブが出る。
 */
export function sotGlyph(spec: SotSpec, ink: BodyInk = REAL_INK): string {
  const length = spec.length * MM;
  const width = spec.width * MM;
  const pitch = spec.pitch * MM;
  const metal = { fill: ink.paint(METAL), stroke: ink.paint(METAL_EDGE), 'stroke-width': 0.5 };
  // ピンは胴の縁の少し内側から出す (胴の下に隠れる根元)。
  const tuck = 0.5;
  const out = spec.tab ? (spec.span - spec.width - TAB_OUT) * MM : ((spec.span - spec.width) / 2) * MM;
  const foot = (x: number, side: -1 | 1, thick: number): string => rect(
    x - (thick * MM) / 2,
    side < 0 ? -width / 2 - out : width / 2 - tuck,
    thick * MM,
    out + tuck,
    metal,
  );
  const feet = spec.tab
    ? [foot(-pitch, -1, SOT_LEAD), foot(0, -1, SOT89_MIDDLE), foot(pitch, -1, SOT_LEAD)].join('')
      + rect(-(TAB_WIDTH * MM) / 2, width / 2 - tuck, TAB_WIDTH * MM, TAB_OUT * MM + tuck, metal)
    : [foot(-pitch, -1, SOT_LEAD), foot(pitch, -1, SOT_LEAD), foot(0, 1, SOT_LEAD)].join('');
  const body = rect(-length / 2, -width / 2, length, width, {
    rx: 0.8, fill: ink.paint(RESIN), stroke: ink.paint(RESIN_EDGE), 'stroke-width': 0.6,
  });
  return feet + body;
}

/**
 * 直付けの SOT の置き方。**描画も当たり判定もここから取る** (perfboard の約束 9)。
 *
 * 1 番と 2 番のピンを結ぶ向きが胴の長さの向き (`along`)、3 番のピンのある側が
 * `toward`。胴は 1 番・2 番の行と 3 番の行の**真ん中**に置く — 三角 (1 番と 2 番を
 * 隣の穴、3 番を次の行) なら、ピン先がちょうど両方の行に届く。三角でなくても
 * 同じ規則で置き、ピン先から穴まで線を引く (届かない分が図に出る)。
 */
export type SotMount = {
  readonly cx: number;
  readonly cy: number;
  /** 胴の長さの向き (ラジアン)。 */
  readonly angle: number;
  /** 3 番のピンの側が、胴を回した後の +y か。false なら上下を裏返して描く。 */
  readonly upright: boolean;
  /** 外形 (ピン先まで)。幅が長さの向き。 */
  readonly width: number;
  readonly height: number;
  /** 3 本のピン先 (図の座標)。書いた順。 */
  readonly tips: readonly ChipPoint[];
};

export function sotMountOf(points: readonly ChipPoint[], spec: SotSpec): SotMount | null {
  const [first, second, third] = points;
  if (!first || !second || !third) return null;

  const dx = second.x - first.x;
  const dy = second.y - first.y;
  const apart = Math.hypot(dx, dy);
  const along = apart === 0 ? { x: 1, y: 0 } : { x: dx / apart, y: dy / apart };
  const middle = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
  // 3 番のピンの側。1 番・2 番の線の上に乗っていたら、回した +y の側に置く。
  const normal = { x: -along.y, y: along.x };
  const reach = (third.x - middle.x) * normal.x + (third.y - middle.y) * normal.y;
  const toward = reach < 0 ? { x: -normal.x, y: -normal.y } : normal;
  const depth = Math.abs(reach);

  const centre = { x: middle.x + (toward.x * depth) / 2, y: middle.y + (toward.y * depth) / 2 };
  const pitch = spec.pitch * MM;
  const half = (spec.span * MM) / 2;
  const at = (u: number, v: number): ChipPoint => ({
    x: centre.x + along.x * u + toward.x * v,
    y: centre.y + along.y * u + toward.y * v,
  });
  return {
    cx: centre.x,
    cy: centre.y,
    angle: Math.atan2(along.y, along.x),
    upright: toward.x === normal.x && toward.y === normal.y,
    width: spec.length * MM,
    height: spec.span * MM,
    tips: [at(-pitch, -half), at(pitch, -half), at(0, half)],
  };
}

export type DirectSotOptions = {
  readonly points: readonly ChipPoint[];
  readonly variant: string;
  /** ピン先から穴へ渡る半田の色 (基板のピンの線と同じ色)。 */
  readonly lead: string;
  readonly ink?: BodyInk;
};

/** 直付けの SOT。ピン先から穴まで半田の線を引き、その上に胴を置く。 */
export function drawDirectSot(options: DirectSotOptions): string {
  const look = smdLook(options.variant);
  if (look === null || look.spec.kind !== 'sot') return '';
  const mount = sotMountOf(options.points, look.spec);
  if (mount === null) return '';

  const solder = mount.tips
    .map((tip, index) => {
      const hole = options.points[index];
      return hole === undefined ? '' : element('line', {
        x1: num(tip.x), y1: num(tip.y), x2: num(hole.x), y2: num(hole.y),
        stroke: options.lead, 'stroke-width': 2, 'stroke-linecap': 'round',
      });
    })
    .join('');
  const degrees = (mount.angle * 180) / Math.PI;
  const flip = mount.upright ? '' : ' scale(1 -1)';
  const glyph = element(
    'g',
    { transform: `translate(${num(mount.cx)} ${num(mount.cy)}) rotate(${num(degrees)})${flip}` },
    sotGlyph(look.spec, options.ink ?? REAL_INK),
  );
  return solder + glyph;
}

/** 変換基板の基板・シルク・ピンヘッダの樹脂。3 ピンの変換基板 (`packages.ts`) と同じ色。 */
export const ADAPTER_BOARD = { fill: '#1f6b45', edge: '#124a2b', silk: '#dfe4ee', header: '#2b2f33' } as const;
/** ピンヘッダを半田付けしたランド。半径はピッチに対する比。 */
const PAD = '#c9a227';
const PAD_RATIO = 0.26;
/** IC のピン先とランドの間に残す隙間 (px)。 */
const PAD_CLEAR = 1.5;

export type DipAdapterOptions = DipOptions & {
  /** 載っている物 (`sop` / `tssop`)。型番が胴を決める部品 (`chip`) では書かない。 */
  readonly variant?: string;
  /**
   * 型番が決める面実装の胴 (3SK291 の SMQ)。**実寸で描き、胴には印字だけ**を刷る。
   * ピンの名前 (`names`) はランドの内側のシルク、部品の名前 (`label`) は基板の脇に出す。
   */
  readonly chip?: AdapterChip;
  /** 基板の脇に出す部品の名前 (`Q1`)。`chip` のときだけ使う。 */
  readonly label?: string;
  /** 実物の色 (基板の緑・金物) の塗り。白黒の図で差し替える。 */
  readonly paint?: BodyInk;
};

/** 2 列の IC の胴の長さ (mm)。 */
const rowLength = (spec: RowSpec, perSide: number): number => perSide * spec.pitch + spec.ends;

/** 胴とピンの寸法 (mm)。表の姿 (`RowSpec`) も型番の胴 (`AdapterChip`) もこの形にして描く。 */
type ChipDims = {
  readonly length: number; readonly width: number; readonly span: number;
  readonly pitch: number; readonly lead: number;
};

const rowDims = (spec: RowSpec, perSide: number): ChipDims => ({
  length: rowLength(spec, perSide), width: spec.width, span: spec.span,
  pitch: spec.pitch, lead: Math.min(spec.pitch * 0.45, 0.45),
});

/**
 * 変換基板の上の局所座標。**a = ピンの列に沿う向き、c = 列をまたぐ向き**、原点は
 * 渡した中心。縦に置いた DIP でも同じ式で描ける。
 */
type Axes = {
  readonly centre: ChipPoint;
  readonly alongX: boolean;
  readonly at: (a: number, c: number) => ChipPoint;
  /** (a0, c0)–(a1, c1) を対角にした長方形。 */
  readonly block: (a0: number, c0: number, a1: number, c1: number, attrs: Record<string, string | number>) => string;
  /** 点の局所座標。 */
  readonly local: (point: ChipPoint) => { readonly a: number; readonly c: number };
};

/** 変換基板の外形と、その真ん中を原点にした局所座標。 */
type Frame = Axes & { readonly box: ChipBox };

function axesAt(centre: ChipPoint, alongX: boolean): Axes {
  const at = (a: number, c: number): ChipPoint =>
    (alongX ? { x: centre.x + a, y: centre.y + c } : { x: centre.x + c, y: centre.y + a });
  const block = (a0: number, c0: number, a1: number, c1: number, attrs: Record<string, string | number>): string => {
    const corner = at(Math.min(a0, a1), Math.min(c0, c1));
    const along = Math.abs(a1 - a0);
    const across = Math.abs(c1 - c0);
    return rect(corner.x, corner.y, alongX ? along : across, alongX ? across : along, attrs);
  };
  const local = (point: ChipPoint): { a: number; c: number } =>
    (alongX ? { a: point.x - centre.x, c: point.y - centre.y } : { a: point.y - centre.y, c: point.x - centre.x });
  return { centre, alongX, at, block, local };
}

function adapterFrame(points: readonly ChipPoint[], pitch: number): Frame {
  const box = dipBox(points, pitch);
  return { box, ...axesAt({ x: box.x + box.width / 2, y: box.y + box.height / 2 }, chipAlongX(points)) };
}

/** 変換基板の基板とシルクの枠。 */
function boardPlate(box: ChipBox, paint: BodyInk): string {
  const board = rect(box.x, box.y, box.width, box.height, {
    rx: 2, fill: paint.paint(ADAPTER_BOARD.fill), stroke: paint.paint(ADAPTER_BOARD.edge),
  });
  const silk = rect(box.x + 2, box.y + 2, Math.max(box.width - 4, 1), Math.max(box.height - 4, 1), {
    rx: 1.5, fill: 'none', stroke: paint.paint(ADAPTER_BOARD.silk), 'stroke-width': 0.8,
  });
  return board + silk;
}

/** ピンヘッダを半田付けしたランド。 */
const headerPads = (points: readonly ChipPoint[], pitch: number, paint: BodyInk): string => points
  .map((point) => element('circle', { cx: num(point.x), cy: num(point.y), r: num(pitch * PAD_RATIO), fill: paint.paint(PAD) })
    + rect(point.x - 2, point.y - 2, 4, 4, { fill: paint.paint(ADAPTER_BOARD.header) }))
  .join('');

/** 変換基板の基板・シルク・ピンヘッダのランド。 */
const adapterBoard = (frame: Frame, points: readonly ChipPoint[], pitch: number, paint: BodyInk): string =>
  boardPlate(frame.box, paint) + headerPads(points, pitch, paint);

type RowChip = { readonly svg: string; readonly length: number; readonly width: number };

/** 幅の違う 1 本のピン。**胴のどの角か** (a・c の符号) で指す。 */
type WideLead = { readonly a: number; readonly c: number; readonly lead: number };

/**
 * 2 列の胴とピンを、渡した座標の原点に描く。`squeeze` は列をまたぐ向きだけの縮み
 * (長さは保つので、胴に刷る字の大きさは変わらない)。
 */
function rowChip(axes: Axes, dims: ChipDims, perSide: number, squeeze: number, paint: BodyInk, body: string, wide: WideLead | null = null): RowChip {
  const length = dims.length * MM;
  const width = dims.width * MM * squeeze;
  const tipHalf = ((dims.span * MM) / 2) * squeeze;
  const leadPitch = dims.pitch * MM;
  const metal = { fill: paint.paint(METAL) };
  const halfOf = (a: number, c: number): number =>
    ((wide !== null && Math.sign(a) === wide.a && c === wide.c ? wide.lead : dims.lead) * MM) / 2;
  const leads = Array.from({ length: perSide }, (_, index) => (index - (perSide - 1) / 2) * leadPitch)
    .flatMap((a) => [
      axes.block(a - halfOf(a, -1), -tipHalf, a + halfOf(a, -1), -width / 2 + 0.5, metal),
      axes.block(a - halfOf(a, 1), width / 2 - 0.5, a + halfOf(a, 1), tipHalf, metal),
    ])
    .join('');
  const chip = axes.block(-length / 2, -width / 2, length / 2, width / 2, {
    rx: 0.8, fill: body, stroke: RESIN_EDGE, 'stroke-width': 0.6,
  });
  return { svg: leads + chip, length, width };
}

/**
 * DIP の変換基板で、実寸の胴がピンの列に被るときの縮み。**ピン先は DIP のピンのランドの
 * 手前で止める。** ブレッドボードは溝を詰めて描くので (e 行と f 行が 3 ピッチより
 * 近い)、実寸の IC はピンの列に被る。そのときは**列をまたぐ向きだけ**縮める —
 * DIP の樹脂も同じ向きに詰めて描いている。
 */
function squeezeOf(frame: Frame, span: number, points: readonly ChipPoint[], pitch: number): number {
  const rows = points.map((point) => frame.local(point).c);
  const room = (Math.max(...rows) - Math.min(...rows)) / 2 - pitch * PAD_RATIO - PAD_CLEAR;
  return Math.min(1, Math.max(room, 1) / ((span * MM) / 2));
}

/**
 * 1 番の側の印 — IC の 1 番の窪みと、変換基板の 1 番側の端の白い点。
 * DIP の 1 番ピンがある端と列を、局所座標の符号で持つ。
 */
function pinOneMarks(frame: Frame, first: ChipPoint, chip: RowChip, paint: BodyInk, ink: ChipInk): string {
  const { centre, alongX, box } = frame;
  const along = alongX ? first.x - centre.x : first.y - centre.y;
  const across = alongX ? first.y - centre.y : first.x - centre.x;
  const endSign = along < 0 ? -1 : 1;
  const rowSign = across < 0 ? -1 : 1;
  const dimple = frame.at(endSign * (chip.length / 2 - 2), rowSign * (chip.width / 2 - 2));
  const dot = frame.at(endSign * ((alongX ? box.width : box.height) / 2 - 4.5), 0);
  return element('circle', { cx: num(dimple.x), cy: num(dimple.y), r: 1.1, fill: ink.chipText, opacity: 0.6 })
    + element('circle', { cx: num(dot.x), cy: num(dot.y), r: 1.8, fill: paint.paint(ADAPTER_BOARD.silk) });
}

/**
 * DIP 化した変換基板に載った 2 列の IC (`dip8/sop`)。**外形は DIP の樹脂と同じ**
 * (`dipBox`) — 当たり判定が DIP のまま使える。ピンの番号は刷らない (IC のピン先が
 * 番号の置き場に来る)。向きは**1 番側の端の白い点**と、IC の 1 番の窪みで示す。
 * 載っている物が表に無ければ DIP の樹脂で描く。
 */
export function drawDipAdapter(options: DipAdapterOptions): string {
  if (options.chip !== undefined) return drawDipModelChip(options, options.chip);
  const look = smdLook(options.variant ?? null);
  if (look === null || look.spec.kind !== 'row') return dipChip(options);
  const { points, pinOne, pitch, caption, scale, ink } = options;
  const first = points[pinOne] ?? points[0];
  if (first === undefined) return '';
  const paint = options.paint ?? REAL_INK;

  const frame = adapterFrame(points, pitch);
  const perSide = Math.max(points.length / 2, 1);
  const chip = rowChip(frame, rowDims(look.spec, perSide), perSide, squeezeOf(frame, look.spec.span, points, pitch), paint, ink.body);
  return adapterBoard(frame, points, pitch, paint)
    + chip.svg
    + pinOneMarks(frame, first, chip, paint, ink)
    + chipLabel(caption, frame.centre, chip.length, frame.alongX, scale, ink.chipText);
}

/** IC に刷るキャプション。**IC の長さに収まるまで字を詰める** (DIP の樹脂と同じ考え)。 */
function chipLabel(text: string, centre: ChipPoint, length: number, alongX: boolean, scale: number, fill: string): string {
  const size = Math.min(scale * 9.5, (length - 4) / Math.max(textWidth(text), 1));
  const style = { 'font-size': num(size), fill };
  if (alongX) return svgText(centre.x, centre.y + size * 0.35, text, style);
  return element(
    'g',
    { transform: `translate(${num(centre.x)} ${num(centre.y)}) rotate(-90)` },
    svgText(0, size * 0.35, text, style),
  );
}

/** 変換基板のシルクに刷る字 (ピンの名前と部品の名前) の大きさ。 */
const SILK_NAME_FONT = 5.5;
const SILK_LABEL_FONT = 7;
/** ピンの名前を、ランドの中心から胴の側へ寄せる量 (px)。ランドの縁 (半径 5.2) のすぐ内側。 */
const SILK_NAME_IN = 10.5;
/** 字の基準線を字の真ん中から下げる比 (大文字の高さの半分)。 */
const SILK_MIDDLE = 0.36;

/** 白いシルクの字 1 つ。真ん中を (x, y) に置く。 */
const silkText = (at: ChipPoint, text: string, size: number, paint: BodyInk): string =>
  svgText(at.x, at.y + size * SILK_MIDDLE, text, { 'font-size': num(size), fill: paint.paint(ADAPTER_BOARD.silk) });

/** 胴の脇に刷る部品の名前。**空きに収まるまで字を詰める。** */
function silkLabel(at: ChipPoint, text: string, room: number, scale: number, paint: BodyInk): string {
  if (text === '' || room <= 0) return '';
  const size = Math.min(scale * SILK_LABEL_FONT, room / Math.max(textWidth(text), 1));
  return silkText(at, text, size, paint);
}

/**
 * 型番が胴を決める面実装 (3SK291 の SMQ) を DIP の変換基板に載せた姿。**胴は実寸**で、
 * 刷るのは実物の印字だけ。ピンの名前はランドのすぐ内側の白いシルク (入らなければ基板の外)、
 * 部品の名前は基板の外 (1 番の白い点の反対の端) に出す。向きは 1 番側の白い点と、幅の違うピンで示す。
 */
function drawDipModelChip(options: DipAdapterOptions, model: AdapterChip): string {
  const { points, names, pinOne, pitch, scale, ink } = options;
  const first = points[pinOne] ?? points[0];
  if (first === undefined) return '';
  const paint = options.paint ?? REAL_INK;
  const frame = adapterFrame(points, pitch);
  const perSide = Math.max(points.length / 2, 1);

  // 幅の違うピンは、その番号のランドと同じ角。番号は 1 番からピンの並びを巡る。
  const widePoint = model.wide === undefined ? undefined : points[(pinOne + model.wide.pin - 1) % points.length];
  const wideAt = widePoint === undefined ? null : frame.local(widePoint);
  const wide = wideAt === null || model.wide === undefined
    ? null
    : { a: Math.sign(wideAt.a), c: Math.sign(wideAt.c) || 1, lead: model.wide.lead };
  const chip = rowChip(frame, model, perSide, squeezeOf(frame, model.span, points, pitch), paint, ink.body, wide);

  // ピンの名前はランドのすぐ内側のシルク。**胴のピン先との間に字が入らなければ基板の外**
  // (ブレッドボードの溝をまたぐ 2 行は近く、実寸の胴でほぼ埋まる)。
  const rowHalf = Math.max(...points.map((point) => Math.abs(frame.local(point).c)));
  const tipHalf = (model.span * MM) / 2;
  const silkFits = rowHalf - SILK_NAME_IN - (scale * SILK_NAME_FONT) / 2 >= tipHalf + 1;
  const legends = silkFits
    ? points
      .map((point, index) => {
        const { a, c } = frame.local(point);
        return silkText(frame.at(a, c - Math.sign(c) * SILK_NAME_IN), names[index] ?? '', scale * SILK_NAME_FONT, paint);
      })
      .join('')
    : dipOutsideNames(options);

  // 1 番側の端の白い点。
  const endSign = frame.local(first).a < 0 ? -1 : 1;
  const half = (frame.alongX ? frame.box.width : frame.box.height) / 2;
  const dot = frame.at(endSign * (half - 4.5), 0);
  // 部品の名前は**基板の外、1 番の反対の端の脇** (横の基板)。基板は実寸の胴でほぼ埋まり、
  // 中に字の入る場所が無い。ピンの 2 行の真ん中の高さなので、穴の行には乗らない。
  // 立てた基板では基板の下に出す。
  const size = scale * SILK_LABEL_FONT;
  const { box } = frame;
  const label = options.label === undefined ? '' : frame.alongX
    ? svgText(endSign < 0 ? box.x + box.width + 3 : box.x - 3, frame.centre.y + size * SILK_MIDDLE, options.label,
      { ...outsideTextStyle(size, ink), anchor: endSign < 0 ? 'start' : 'end' })
    : svgText(frame.centre.x, box.y + box.height + size + 2, options.label, outsideTextStyle(size, ink));

  return adapterBoard(frame, points, pitch, paint)
    + chip.svg
    + element('circle', { cx: num(dot.x), cy: num(dot.y), r: 1.8, fill: paint.paint(ADAPTER_BOARD.silk) })
    + chipLabel(model.mark, frame.centre, chip.length, frame.alongX, scale, ink.chipText)
    + legends + label;
}

/** 1 列の変換基板が、ピンの列から胴の側へ張り出す量と、胴の中心までの距離 (ピッチに対する比)。 */
const SIP_BOARD_REACH = 2.2;
const SIP_CHIP_AT = 0.95;

export type SipAdapterOptions = SipOptions & {
  readonly chip: AdapterChip;
  /** 基板のシルクに刷る部品の名前 (`Q1`)。 */
  readonly label: string;
  readonly paint?: BodyInk;
};

/**
 * 型番が胴を決める面実装を **1 列の変換基板**に載せた姿 (`sip4` + `3SK291`)。基板はピンの列から
 * **ピンの名前と反対の側**へ張り出し、そこに実寸の胴を載せる。ピンの名前は 1 列ヘッダと同じ
 * 置き場 (基板の外。`sipLegends`)。
 */
export function drawSipAdapter(options: SipAdapterOptions): string {
  const { points, pitch, scale, nameSide, ink, chip: model, label } = options;
  if (points.length === 0) return '';
  const paint = options.paint ?? REAL_INK;
  const bar = sipBox(points, pitch);
  const alongX = chipAlongX(points);
  const reach = SIP_BOARD_REACH * pitch;
  // 基板は帯の縁 (ピンの名前の側) から、反対側へ `reach` まで。
  const box: ChipBox = alongX
    ? { x: bar.x, y: nameSide > 0 ? bar.y + bar.height - reach : bar.y, width: bar.width, height: reach }
    : { x: nameSide > 0 ? bar.x + bar.width - reach : bar.x, y: bar.y, width: reach, height: bar.height };
  const row = { x: bar.x + bar.width / 2, y: bar.y + bar.height / 2 };
  const away = -nameSide * SIP_CHIP_AT * pitch;
  const axes = axesAt(alongX ? { x: row.x, y: row.y + away } : { x: row.x + away, y: row.y }, alongX);
  // 幅の違うピンは、ピンの列から遠い側の、並びの終わりの角 (1 番を並びの始めに向けた置き方)。
  const wide = model.wide === undefined ? null : { a: 1, c: -nameSide, lead: model.wide.lead };
  const drawn = rowChip(axes, model, 2, 1, paint, ink.body, wide);
  const half = (alongX ? box.width : box.height) / 2;
  const room = half - drawn.length / 2;
  const first = points[0]!;
  const endSign = axes.local(first).a < 0 ? -1 : 1;
  const dot = axes.at(endSign * (half - 4.5), 0);

  return boardPlate(box, paint) + headerPads(points, pitch, paint)
    + drawn.svg
    + element('circle', { cx: num(dot.x), cy: num(dot.y), r: 1.8, fill: paint.paint(ADAPTER_BOARD.silk) })
    + chipLabel(model.mark, axes.centre, drawn.length, alongX, scale, ink.chipText)
    + silkLabel(axes.at(-endSign * (drawn.length / 2 + room / 2), 0), label, alongX ? room - 6 : reach - 8, scale, paint)
    + sipLegends(options);
}
