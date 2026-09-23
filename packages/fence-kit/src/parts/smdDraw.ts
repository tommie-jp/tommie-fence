import { element } from '../markup.ts';
import { num, svgText } from '../svg.ts';
import { textWidth } from '../textFit.ts';
import { REAL_INK } from './ink.ts';
import type { BodyInk, BodyPart } from './ink.ts';
import { chipAlongX, dipBox, dipChip } from './chips.ts';
import type { ChipBox, ChipInk, ChipPoint, DipOptions } from './chips.ts';
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


/** 電極と足の金物。 */
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

/** 直付けの 2 本足 (チップ・SOD) の表。それ以外は null。 */
function twoLeadSpec(part: BodyPart): ChipSpec | LeadedSpec | null {
  const look = smdLook(part.variant ?? null);
  if (look === null || look.onAdapter) return null;
  return look.spec.kind === 'chip' || look.spec.kind === 'leaded' ? look.spec : null;
}

/**
 * 直付けの 2 本足の外形 (px)。**足の間隔では伸び縮みしない** (実物の寸法)。
 * 面実装の姿でなければ null — 呼ぶ側 (`bodySize`) が差し込み型の数式に戻る。
 */
export function smdBodySize(part: BodyPart): Size | null {
  const spec = twoLeadSpec(part);
  if (spec === null) return null;
  if (spec.kind === 'chip') return { width: spec.length * MM, height: spec.width * MM };
  return { width: spec.span * MM, height: spec.width * MM };
}

/**
 * 直付けの 2 本足の胴。座標は `bodies.ts` と同じ「原点が中央・x 軸が足の向き」。
 * 面実装の姿でなければ null。
 */
export function drawSmdBody(part: BodyPart, ink: BodyInk = REAL_INK): string | null {
  const spec = twoLeadSpec(part);
  if (spec === null) return null;
  return spec.kind === 'chip' ? chipBody(part, spec, ink) : leadedBody(part, spec, ink);
}

/** チップ。**両端の電極が金物**で、そこが板のランドに半田付けされる。 */
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
 * 樹脂の胴から平たい足が出るダイオード。**カソード帯は差し込み型と同じ側**
 * (印が無ければ後に書いた穴)。足は胴の下から出て、両端でランドに載る。
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
/** SOT の足の幅 (mm)。SOT-89 の真ん中の足だけ太い。 */
const SOT_LEAD = 0.4;
const SOT89_MIDDLE = 0.53;

/**
 * SOT の胴と足。**原点が胴の中心、1 番と 2 番の足が -y の側、3 番が +y の側**
 * (1 番が -x)。SOT-89 は 3 本とも -y に並び、+y にタブが出る。
 */
export function sotGlyph(spec: SotSpec, ink: BodyInk = REAL_INK): string {
  const length = spec.length * MM;
  const width = spec.width * MM;
  const pitch = spec.pitch * MM;
  const metal = { fill: ink.paint(METAL), stroke: ink.paint(METAL_EDGE), 'stroke-width': 0.5 };
  // 足は胴の縁の少し内側から出す (胴の下に隠れる根元)。
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
 * 1 番と 2 番の足を結ぶ向きが胴の長さの向き (`along`)、3 番の足のある側が
 * `toward`。胴は 1 番・2 番の行と 3 番の行の**真ん中**に置く — 三角 (1 番と 2 番を
 * 隣の穴、3 番を次の行) なら、足先がちょうど両方の行に届く。三角でなくても
 * 同じ規則で置き、足先から穴まで線を引く (届かない分が図に出る)。
 */
export type SotMount = {
  readonly cx: number;
  readonly cy: number;
  /** 胴の長さの向き (ラジアン)。 */
  readonly angle: number;
  /** 3 番の足の側が、胴を回した後の +y か。false なら上下を裏返して描く。 */
  readonly upright: boolean;
  /** 外形 (足先まで)。幅が長さの向き。 */
  readonly width: number;
  readonly height: number;
  /** 3 本の足先 (図の座標)。書いた順。 */
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
  // 3 番の足の側。1 番・2 番の線の上に乗っていたら、回した +y の側に置く。
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
  /** 足先から穴へ渡る半田の色 (板の足の線と同じ色)。 */
  readonly lead: string;
  readonly ink?: BodyInk;
};

/** 直付けの SOT。足先から穴まで半田の線を引き、その上に胴を置く。 */
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

/** 変換基板の板・シルク・ピンヘッダの樹脂。3 本足の変換基板 (`packages.ts`) と同じ色。 */
export const ADAPTER_BOARD = { fill: '#1f6b45', edge: '#124a2b', silk: '#dfe4ee', header: '#2b2f33' } as const;
/** ピンヘッダを半田付けしたランド。半径はピッチに対する比。 */
const PAD = '#c9a227';
const PAD_RATIO = 0.26;
/** IC の足先とランドの間に残す隙間 (px)。 */
const PAD_CLEAR = 1.5;

export type DipAdapterOptions = DipOptions & {
  /** 載っている物 (`sop` / `tssop`)。 */
  readonly variant: string;
  /** 実物の色 (基板の緑・金物) の塗り。白黒の図で差し替える。 */
  readonly paint?: BodyInk;
};

/** 2 列の IC の胴の長さ (mm)。 */
const rowLength = (spec: RowSpec, perSide: number): number => perSide * spec.pitch + spec.ends;

/**
 * 変換基板の上の局所座標。**a = 足の列に沿う向き、c = 列をまたぐ向き**、原点は
 * DIP の外形の真ん中。縦に置いた DIP でも同じ式で描ける。
 */
type Frame = {
  readonly box: ChipBox;
  readonly centre: ChipPoint;
  readonly alongX: boolean;
  readonly at: (a: number, c: number) => ChipPoint;
  /** (a0, c0)–(a1, c1) を対角にした長方形。 */
  readonly block: (a0: number, c0: number, a1: number, c1: number, attrs: Record<string, string | number>) => string;
};

function adapterFrame(points: readonly ChipPoint[], pitch: number): Frame {
  const box = dipBox(points, pitch);
  const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const alongX = chipAlongX(points);
  const at = (a: number, c: number): ChipPoint =>
    (alongX ? { x: centre.x + a, y: centre.y + c } : { x: centre.x + c, y: centre.y + a });
  const block = (a0: number, c0: number, a1: number, c1: number, attrs: Record<string, string | number>): string => {
    const corner = at(Math.min(a0, a1), Math.min(c0, c1));
    const along = Math.abs(a1 - a0);
    const across = Math.abs(c1 - c0);
    return rect(corner.x, corner.y, alongX ? along : across, alongX ? across : along, attrs);
  };
  return { box, centre, alongX, at, block };
}

/** 変換基板の板・シルク・ピンヘッダのランド。 */
function adapterBoard(frame: Frame, points: readonly ChipPoint[], pitch: number, paint: BodyInk): string {
  const { box } = frame;
  const board = rect(box.x, box.y, box.width, box.height, {
    rx: 2, fill: paint.paint(ADAPTER_BOARD.fill), stroke: paint.paint(ADAPTER_BOARD.edge),
  });
  const silk = rect(box.x + 2, box.y + 2, Math.max(box.width - 4, 1), Math.max(box.height - 4, 1), {
    rx: 1.5, fill: 'none', stroke: paint.paint(ADAPTER_BOARD.silk), 'stroke-width': 0.8,
  });
  const pads = points
    .map((point) => element('circle', { cx: num(point.x), cy: num(point.y), r: num(pitch * PAD_RATIO), fill: paint.paint(PAD) })
      + rect(point.x - 2, point.y - 2, 4, 4, { fill: paint.paint(ADAPTER_BOARD.header) }))
    .join('');
  return board + silk + pads;
}

type RowChip = { readonly svg: string; readonly length: number; readonly width: number };

/**
 * 2 列の IC の胴と足。**足先は DIP の足のランドの手前で止める。** ブレッドボードは
 * 溝を詰めて描くので (e 行と f 行が 3 ピッチより近い)、実寸の IC は足の列に被る。
 * そのときは**列をまたぐ向きだけ**縮める — DIP の樹脂も同じ向きに詰めて描いている。
 * 長さを保つので、IC に刷る字の大きさは変わらない。
 */
function rowChip(frame: Frame, spec: RowSpec, points: readonly ChipPoint[], pitch: number, paint: BodyInk, body: string): RowChip {
  const perSide = Math.max(points.length / 2, 1);
  const length = rowLength(spec, perSide) * MM;
  const rows = points.map((point) => (frame.alongX ? point.y : point.x));
  const room = (Math.max(...rows) - Math.min(...rows)) / 2 - pitch * PAD_RATIO - PAD_CLEAR;
  const squeeze = Math.min(1, Math.max(room, 1) / ((spec.span * MM) / 2));
  const width = spec.width * MM * squeeze;
  const tipHalf = ((spec.span * MM) / 2) * squeeze;
  const leadPitch = spec.pitch * MM;
  const leadWidth = Math.min(spec.pitch * 0.45, 0.45) * MM;
  const metal = { fill: paint.paint(METAL) };
  const leads = Array.from({ length: perSide }, (_, index) => (index - (perSide - 1) / 2) * leadPitch)
    .flatMap((a) => [
      frame.block(a - leadWidth / 2, -tipHalf, a + leadWidth / 2, -width / 2 + 0.5, metal),
      frame.block(a - leadWidth / 2, width / 2 - 0.5, a + leadWidth / 2, tipHalf, metal),
    ])
    .join('');
  const chip = frame.block(-length / 2, -width / 2, length / 2, width / 2, {
    rx: 0.8, fill: body, stroke: RESIN_EDGE, 'stroke-width': 0.6,
  });
  return { svg: leads + chip, length, width };
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
 * (`dipBox`) — 当たり判定が DIP のまま使える。足の番号は刷らない (IC の足先が
 * 番号の置き場に来る)。向きは**1 番側の端の白い点**と、IC の 1 番の窪みで示す。
 * 載っている物が表に無ければ DIP の樹脂で描く。
 */
export function drawDipAdapter(options: DipAdapterOptions): string {
  const look = smdLook(options.variant);
  if (look === null || look.spec.kind !== 'row') return dipChip(options);
  const { points, pinOne, pitch, caption, scale, ink } = options;
  const first = points[pinOne] ?? points[0];
  if (first === undefined) return '';
  const paint = options.paint ?? REAL_INK;

  const frame = adapterFrame(points, pitch);
  const chip = rowChip(frame, look.spec, points, pitch, paint, ink.body);
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
