import type { Layout } from '../model/layout.ts';
import { discretePins } from '../parts/pinout.ts';
import { footprintOf } from '../parts/footprint.ts';
import { bodyRect } from '../placement/geometry.ts';
import type { OrientedRect } from '../placement/geometry.ts';
import type { PlacedPart, Point, Rect } from '../types.ts';
import { CAPTION_CLASS, SIP_LEGEND_DEPTH, packageAngle, renderOne } from './parts.ts';
import type { PartRoom } from './parts.ts';
import { BOARD_HALO_OPACITY, BOARD_INK_OPACITY, directSotSpec, element, num, packageExtent, packageHalfWidth, svgText } from 'fence-kit';
import type { Theme } from './theme.ts';

/**
 * 部品表の絵 (`- parts`)。**基板に描いたのと同じ関数 (`renderOne`) で、同じ大きさで描く**
 * (breadboard の部品表と同じ決め。52 の docs/152)。刷り込み (フィルムの `104`) も基板と同じに出る。
 * 名札 (`R1 10k`) だけは表の ID と値の欄に並んでいるので外す。
 *
 * 基板には出ないが表には足す字: 3 ピンのピンの名前 (`E` `C` `B`、表に無い型番は `1` `2` `3`) と、
 * 極性 (ダイオードの仲間は `A` `K`、電解とタンタルは `+` `−`)。perfboard はピンに名前を書かないので、
 * 極性は**先に書いた穴が + 側 (アノード)**。
 */
export type PartsIcon = {
  /** 原点を絵の外形の左上に合わせた SVG。 */
  readonly svg: string;
  readonly width: number;
  readonly height: number;
};

/** ピンの周りに残す余白 (ピンの間隔に対する比)。ランドの丸が外形からはみ出さないように。 */
const PIN_MARGIN = 0.35;
/** 足す字の大きさ (字の大きさに対する比) と、ピン・胴からの隔たり (px)。 */
const MARK_SIZE = 0.9;
const MARK_GAP = 4;

const CAPTION_PATTERN = new RegExp(`<text [^>]*class="${CAPTION_CLASS}"[^>]*>[^<]*</text>`, 'g');

/** 向きのあるダイオードの仲間。`diac` は向きが無いので入れない。 */
const DIODES = new Set(['diode', 'led', 'zener', 'schottky', 'photodiode', 'varicap']);
const POLAR_CAPACITORS = new Set(['electrolytic', 'tantalum']);

/**
 * 絵を描く足形。DIP・名前で引くチップ・モジュールの基板・コネクタは型番の欄で足り、絵は幅を
 * 取りすぎるので描かない (前の絵の欄と同じく空)。
 */
const DRAWN = new Set(['two-lead', 'three-lead', 'edge', 'switch', 'wound', 'sip']);

/** 名札は外すので、置き場はどこでもよい (いつも最初の候補)。 */
const ANYWHERE: PartRoom = { place: (_x, below) => below, pick: () => 0, blocked: () => false };

/**
 * 縦に挿した部品は**横に寝かせる** (表の行は横に長い)。2 ピンは斜めでも、3 ピンはピンが 1 列に
 * 縦に並ぶときだけ。ピンの間の穴の数 (長さ) は変えない。番地は表の絵を描くためだけのもの。
 */
function lieFlat(part: PlacedPart): PlacedPart {
  const kind = footprintOf(part.type, part.variant)?.kind;
  const addresses = part.pins.map((pin) => pin.address);
  const [first, second] = addresses;
  if (first === undefined || second === undefined) return part;
  const twoLead = addresses.length === 2 && kind !== 'three-lead';
  const upright = addresses.length === 3 && kind === 'three-lead' && addresses.every((address) => address.col === first.col);
  if (!(twoLead && first.row !== second.row) && !upright) return part;
  const span = Math.max(1, Math.round(Math.hypot(first.row - second.row, first.col - second.col)));
  return {
    ...part,
    pins: part.pins.map((pin, index) => ({ ...pin, address: { row: first.row, col: first.col + index * span } })),
  };
}

const union = (rects: readonly Rect[]): Rect | null => {
  if (rects.length === 0) return null;
  const left = Math.min(...rects.map((rect) => rect.x));
  const top = Math.min(...rects.map((rect) => rect.y));
  const right = Math.max(...rects.map((rect) => rect.x + rect.width));
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
};

const axisRect = (rect: OrientedRect): Rect => {
  const { angle } = rect;
  const halfW = (Math.abs(Math.cos(angle)) * rect.width + Math.abs(Math.sin(angle)) * rect.height) / 2;
  const halfH = (Math.abs(Math.sin(angle)) * rect.width + Math.abs(Math.cos(angle)) * rect.height) / 2;
  return { x: rect.cx - halfW, y: rect.cy - halfH, width: halfW * 2, height: halfH * 2 };
};

/**
 * 3 ピンの胴 (TO-92・半固定抵抗など)。**描くのと同じ量で測る** — ピンの中心から上下へ `packageExtent`、
 * 左右へ `packageHalfWidth` を、ピンの並びの向き (`packageAngle`) に回す。`bodyRect` は配線よけの
 * 細い胴で、半固定抵抗の青い箱より小さい。
 */
function packageBox(part: PlacedPart, layout: Layout): Rect | null {
  const body = bodyRect(part, layout);
  if (body === null) return null;
  const shape = { type: part.type, value: part.value, variant: part.variant, pins: part.pins.map(() => ({ name: '' })) };
  const { up, down } = packageExtent(shape, layout.pitch);
  const half = packageHalfWidth(shape, layout.pitch);
  const angle = (packageAngle(part) * Math.PI) / 180;
  const corners = [[-half, -up], [half, -up], [-half, down], [half, down]]
    .map(([x, y]) => ({ x: body.cx + x! * Math.cos(angle) - y! * Math.sin(angle), y: body.cy + x! * Math.sin(angle) + y! * Math.cos(angle) }));
  const xs = corners.map((point) => point.x);
  const ys = corners.map((point) => point.y);
  return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
}

/**
 * SIP のピンの名前の帯を足す。名前は胴の外の行の増える側 (横に並ぶなら下、縦に並ぶなら右) に
 * `SIP_LEGEND_DEPTH` だけ出る。
 */
function withLegends(box: Rect, part: PlacedPart): Rect {
  const [first, second] = part.pins.map((pin) => pin.address);
  const across = first !== undefined && second !== undefined && first.row === second.row;
  return across
    ? { ...box, height: box.height + SIP_LEGEND_DEPTH }
    : { ...box, width: box.width + SIP_LEGEND_DEPTH };
}

/** 胴の矩形。円筒の水晶は筒をピンの線の片側に立てるので、そちらへずらす (breadboard と同じ)。 */
function bodyBox(part: PlacedPart, layout: Layout): Rect | null {
  const kind = footprintOf(part.type, part.variant)?.kind;
  if (kind === 'three-lead' && directSotSpec(part.variant) === null) return packageBox(part, layout);
  const body = bodyRect(part, layout);
  if (body === null) return null;
  if (kind === 'sip') return withLegends(axisRect(body), part);
  if (part.type !== 'crystal' || part.variant !== 'cylinder') return axisRect(body);
  const half = body.height / 2;
  return axisRect({ ...body, cx: body.cx + Math.sin(body.angle) * half, cy: body.cy - Math.cos(body.angle) * half });
}

type Mark = { readonly text: string; readonly x: number; readonly y: number; readonly anchor: 'start' | 'middle' | 'end' };

function polesOf(part: PlacedPart): readonly [string, string] | null {
  if (part.pins.length !== 2) return null;
  if (DIODES.has(part.type)) return ['A', 'K'];
  if (part.type === 'capacitor' && part.variant !== null && POLAR_CAPACITORS.has(part.variant)) return ['+', '−'];
  return null;
}

/** 足す字の置き場: 2 ピンの極性はピンの外側、3 ピンの名前は胴の下にピンの真下。 */
function marksOf(part: PlacedPart, layout: Layout, theme: Theme, body: Rect | null): readonly Mark[] {
  const size = theme.metrics.textSize * MARK_SIZE;
  const points = part.pins.map((pin) => layout.point(pin.address));
  const poles = polesOf(part);
  if (poles !== null) {
    const [a, b] = points as [Point, Point];
    const leftFirst = a.x <= b.x;
    const [left, right] = leftFirst ? [a, b] : [b, a];
    const [leftText, rightText] = leftFirst ? poles : [poles[1], poles[0]];
    const reach = layout.pitch * PIN_MARGIN + MARK_GAP;
    const lift = size * 0.35;
    return [
      { text: leftText, x: left.x - reach, y: left.y + lift, anchor: 'end' },
      { text: rightText, x: right.x + reach, y: right.y + lift, anchor: 'start' },
    ];
  }
  // 直付けの SOT はピンが一列に並ばない (三角) ので、名前を並べると重なる。足さない。
  if (part.pins.length !== 3 || footprintOf(part.type, part.variant)?.kind !== 'three-lead' || directSotSpec(part.variant) !== null) return [];
  const names = discretePins(part) ?? ['1', '2', '3'];
  const bottom = Math.max(body === null ? 0 : body.y + body.height, ...points.map((point) => point.y + layout.pitch * PIN_MARGIN));
  return points.map((point, index) => ({ text: names[index] ?? '', x: point.x, y: bottom + MARK_GAP + size * 0.8, anchor: 'middle' }));
}

const markBox = (mark: Mark, size: number): Rect => {
  const width = size * 0.7 * Math.max(1, mark.text.length);
  const x = mark.anchor === 'end' ? mark.x - width : mark.anchor === 'middle' ? mark.x - width / 2 : mark.x;
  return { x, y: mark.y - size * 0.8, width, height: size };
};

/** 足す字は基板の字と同じ色と縁取りで書く (絵の後ろに基板の地を敷くので)。 */
const markText = (mark: Mark, plate: Theme): string =>
  svgText(mark.x, mark.y, mark.text, {
    'font-size': num(plate.metrics.textSize * MARK_SIZE),
    'font-weight': 700,
    anchor: mark.anchor,
    fill: plate.palette.plateText,
    halo: plate.palette.plate,
    haloOpacity: BOARD_HALO_OPACITY, inkOpacity: BOARD_INK_OPACITY,
  });

/** 絵の後ろに敷く基板の地の余白 (px) と角の丸み。 */
const TILE_PAD = 3;
const TILE_RADIUS = 4;

/**
 * 表に置く絵。`plate` は基板の部品を描くテーマ (基板と同じ色で描く)。
 * DIP・機器など、絵を描かない種類は null (欄が空)。
 */
export function partsIcon(part: PlacedPart, layout: Layout, plate: Theme): PartsIcon | null {
  const kind = footprintOf(part.type, part.variant)?.kind;
  if (kind === undefined || !DRAWN.has(kind) || part.pins.length === 0) return null;
  const flat = lieFlat(part);
  const body = bodyBox(flat, layout);
  const marks = marksOf(flat, layout, plate, body);
  const pins = flat.pins.map((pin) => layout.point(pin.address)).map((point) => {
    const margin = layout.pitch * PIN_MARGIN;
    return { x: point.x - margin, y: point.y - margin, width: margin * 2, height: margin * 2 };
  });
  const size = plate.metrics.textSize * MARK_SIZE;
  const inner = union([...(body === null ? [] : [body]), ...pins, ...marks.map((mark) => markBox(mark, size))]);
  if (inner === null) return null;
  const box = { x: inner.x - TILE_PAD, y: inner.y - TILE_PAD, width: inner.width + TILE_PAD * 2, height: inner.height + TILE_PAD * 2 };
  // **絵の後ろに基板の地を敷く。** 部品とピンの字は基板の上で読む色 (淡い字・基板の色の縁取り) なので、
  // 表の白い地にそのまま置くと滲んで読めない。基板の一片に載せて、基板の見え方のまま出す。
  const tile = element('rect', {
    x: num(box.x), y: num(box.y), width: num(box.width), height: num(box.height), rx: TILE_RADIUS,
    fill: plate.palette.plate,
  });
  const drawn = renderOne(flat, layout, plate, ANYWHERE).replace(CAPTION_PATTERN, '');
  return {
    svg: `<g transform="translate(${num(-box.x)} ${num(-box.y)})">${tile}${drawn}${marks.map((mark) => markText(mark, plate)).join('')}</g>`,
    width: box.width,
    height: box.height,
  };
}
