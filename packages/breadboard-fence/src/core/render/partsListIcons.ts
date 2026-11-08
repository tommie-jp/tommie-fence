import type { SceneRect } from 'fence-kit';
import type { Layout } from '../model/layout.ts';
import type { HoleAddress, PlacedPart, Point, Rect } from '../types.ts';
import { CAPTION_CLASS, pinPoints } from './partCommon.ts';
import { renderPart } from './parts.ts';
import { bodyOf } from './scene.ts';
import { BOARD_HALO_OPACITY, BOARD_INK_OPACITY, TEXT_HALO_WIDTH, num, svgText } from './svg.ts';
import { legNameBoxes } from './threeLead.ts';
import type { RenderTheme } from './theme.ts';
import { textScale } from './theme.ts';

/**
 * 部品表の絵 (`parts-list: symbols`)。**基板に描いたのと同じ関数 (`renderPart`) で、同じ大きさで描く**
 * (実機で「部品表の記号はボードに表示しているものと同じに。サイズも同じぐらいに」と頼まれた)。
 * 刷り込み (コンデンサの `104`) もトランジスタのピンの名前 (`E` `C` `B`) も基板と同じに出る。
 * 名札 (`R1 1k`) だけは表の ID と値の欄に並んでいるので外す。
 */
export type PartsIcon = {
  /** 原点を絵の外形の左上に合わせた SVG。 */
  readonly svg: string;
  readonly width: number;
  readonly height: number;
};

/** ピンの周りに残す余白 (px)。ピンの丸が外形からはみ出さないように。 */
const PIN_MARGIN = 4;

/** 極性の字 (`A` `K` `+` `−`) の大きさ (字の大きさに対する比) と、ピンからの隔たり (px)。 */
const POLE_SIZE = 0.9;
const POLE_GAP = 6;

const CAPTION_PATTERN = new RegExp(`<text [^>]*class="${CAPTION_CLASS}"[^>]*>[^<]*</text>`, 'g');

/** 向きのあるダイオードの仲間。`diac` は向きが無いので入れない。 */
const DIODES = new Set(['diode', 'led', 'zener', 'schottky', 'photodiode', 'varicap']);
/** 極性のあるコンデンサの姿。姿を書かなければピン名の `(-)` で電解とみなす (fence-kit の capacitorLook)。 */
const POLAR_CAPACITORS = new Set(['electrolytic', 'tantalum']);

/**
 * 縦に挿した 2 ピンの部品は**横に寝かせる** — 表の行は横に長い。ピンの間の穴の数 (長さ) は変えない。
 * 片側がレール (`-b43 j43`) でも、穴の側の行に寝かせる。
 * 番地は表の絵を描くためだけのもので、基板の上の部品は動かさない。
 */
function lieFlat(part: PlacedPart, layout: Layout): PlacedPart {
  if (part.kind !== 'two-lead' || part.pins.length !== 2) return part;
  const points = pinPoints(part, layout);
  const hole = part.pins.map((pin) => pin.address).find((address): address is HoleAddress => address?.kind === 'hole');
  if (!points || !hole) return part;
  const [a, b] = points as [Point, Point];
  if (Math.abs(a.y - b.y) < 1) return part;
  const span = Math.max(1, Math.round(Math.hypot(a.x - b.x, a.y - b.y) / layout.pitch));
  const start = Math.max(1, Math.min(hole.col, layout.columns - span));
  return {
    ...part,
    pins: part.pins.map((pin, index) => ({
      ...pin,
      address: { kind: 'hole', row: hole.row, col: start + index * span },
    })),
  };
}

/**
 * 横に寝かせた 2 ピンの間を `maxSpan` 穴まで詰める。胴の大きさはこの範囲で変わらない
 * (リードが短くなるだけ) ので、絵の高さと行の送りも変わらない。番地は表の絵のためだけのもの。
 */
function withinSpan(part: PlacedPart, maxSpan: number): PlacedPart {
  if (part.kind !== 'two-lead' || part.pins.length !== 2) return part;
  const [a, b] = part.pins.map((pin) => pin.address);
  if (a?.kind !== 'hole' || b?.kind !== 'hole' || a.row !== b.row || Math.abs(b.col - a.col) <= maxSpan) return part;
  const col = a.col + Math.sign(b.col - a.col) * maxSpan;
  return { ...part, pins: part.pins.map((pin, index) => (index === 1 ? { ...pin, address: { ...b, col } } : pin)) };
}

const union = (rects: readonly Rect[]): Rect | null => {
  if (rects.length === 0) return null;
  const left = Math.min(...rects.map((rect) => rect.x));
  const top = Math.min(...rects.map((rect) => rect.y));
  const right = Math.max(...rects.map((rect) => rect.x + rect.width));
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
};

/** 傾いた胴 (中心と角度 — ラジアン) を、軸にそった矩形に直す。 */
const axisRect = (rect: SceneRect): Rect => {
  const { angle } = rect;
  const halfW = (Math.abs(Math.cos(angle)) * rect.width + Math.abs(Math.sin(angle)) * rect.height) / 2;
  const halfH = (Math.abs(Math.sin(angle)) * rect.width + Math.abs(Math.cos(angle)) * rect.height) / 2;
  return { x: rect.cx - halfW, y: rect.cy - halfH, width: halfW * 2, height: halfH * 2 };
};

/**
 * 胴の矩形。**円筒の水晶は筒をピンの線の片側に立てて描く** (fence-kit の tubeCan: 筒は
 * ピンの線から胴の高さぶん、向きの左手の側) ので、ピンの真ん中に置いた矩形を筒の側へずらす。
 */
function bodyRectOf(part: PlacedPart, layout: Layout): Rect | null {
  const body = bodyOf(part, layout);
  if (body === null) return null;
  if (part.type !== 'crystal' || part.variant !== 'cylinder') return axisRect(body);
  const half = body.height / 2;
  return axisRect({ ...body, cx: body.cx + Math.sin(body.angle) * half, cy: body.cy - Math.cos(body.angle) * half });
}

/**
 * 印が付く側のピン。fence-kit の `markedIndex` と同じ規則 — 片方にしか印が無ければ反対側が決まり、
 * どちらにも無ければ**先に書いた穴が + 側 (アノード)**。
 */
function markedIndex(part: PlacedPart, mark: string, opposite: string): number {
  const names = part.pins.map((pin) => pin.name.toUpperCase());
  const found = names.indexOf(mark);
  if (found !== -1) return found;
  const other = names.indexOf(opposite);
  return other !== -1 ? 1 - other : 0;
}

/**
 * ピンの外側に添える極性の字。ダイオードは `A` `K`、極性のあるコンデンサは `+` `−`
 * (実機で「A,K がわかるように」「+、− がわかるように」と頼まれた)。向きの無い部品は null。
 */
function polesOf(part: PlacedPart): readonly [string, string] | null {
  if (part.kind !== 'two-lead' || part.pins.length !== 2) return null;
  if (DIODES.has(part.type)) {
    return markedIndex(part, 'A', 'K') === 0 ? ['A', 'K'] : ['K', 'A'];
  }
  const polar = part.type === 'capacitor'
    && (part.variant == null ? part.pins.some((pin) => pin.name === '-') : POLAR_CAPACITORS.has(part.variant));
  if (!polar) return null;
  return markedIndex(part, '+', '-') === 0 ? ['+', '−'] : ['−', '+'];
}

type Pole = { readonly text: string; readonly x: number; readonly y: number; readonly anchor: 'start' | 'end' };

/** 極性の字を、左のピンの左・右のピンの右に置く。 */
function polePlaces(part: PlacedPart, layout: Layout, theme: RenderTheme): readonly Pole[] {
  const poles = polesOf(part);
  const points = pinPoints(part, layout);
  if (poles === null || !points) return [];
  const size = theme.metrics.textSize * POLE_SIZE;
  const [a, b] = points as [Point, Point];
  const leftFirst = a.x <= b.x;
  const [left, right] = leftFirst ? [a, b] : [b, a];
  const [leftText, rightText] = leftFirst ? poles : [poles[1], poles[0]];
  // ベースラインは字の高さの真ん中をピンの高さに合わせる。
  const lift = size * 0.35;
  return [
    { text: leftText, x: left.x - POLE_GAP, y: left.y + lift, anchor: 'end' },
    { text: rightText, x: right.x + POLE_GAP, y: right.y + lift, anchor: 'start' },
  ];
}

const poleBox = (pole: Pole, size: number): Rect => {
  const width = size * 0.7;
  return { x: pole.anchor === 'end' ? pole.x - width : pole.x, y: pole.y - size * 0.8, width, height: size };
};

/** 絵の外形: 胴・ピン (余白つき)・ピンの名前・極性の字。 */
function boxOf(part: PlacedPart, layout: Layout, theme: RenderTheme, poles: readonly Pole[]): Rect | null {
  const body = bodyRectOf(part, layout);
  const pins = (pinPoints(part, layout) ?? []).map((point) => ({
    x: point.x - PIN_MARGIN, y: point.y - PIN_MARGIN, width: PIN_MARGIN * 2, height: PIN_MARGIN * 2,
  }));
  const names = part.kind === 'three-lead' ? legNameBoxes(part, layout, theme, 0) : [];
  const size = theme.metrics.textSize * POLE_SIZE;
  return union([...(body === null ? [] : [body]), ...pins, ...names, ...poles.map((pole) => poleBox(pole, size))]);
}

/** 極性の字。トランジスタのピンの名前 (`threeLead.ts`) と同じ太字・縁取り・色で書く。 */
const poleText = (pole: Pole, theme: RenderTheme): string =>
  svgText(pole.x, pole.y, pole.text, {
    'font-size': num(theme.metrics.textSize * POLE_SIZE),
    'font-weight': 700,
    anchor: pole.anchor,
    fill: theme.palette.partText,
    halo: theme.palette.textHalo,
    haloWidth: TEXT_HALO_WIDTH * textScale(theme),
    haloOpacity: BOARD_HALO_OPACITY, inkOpacity: BOARD_INK_OPACITY,
  });

/**
 * 表に置く絵。描かない種類 (機器と DIP と、Pico などのマイコンボード — 型番の欄で足り、絵は幅を
 * 取りすぎる。ボードは 1 つで全部の行の送りを広げてしまう) と、番地の決まらない部品は null。
 */
export function partsIcon(part: PlacedPart, layout: Layout, theme: RenderTheme, maxSpan = Infinity): PartsIcon | null {
  if (part.kind === 'device' || part.kind === 'dip' || part.kind === 'board') return null;
  const flat = withinSpan(lieFlat(part, layout), maxSpan);
  const poles = polePlaces(flat, layout, theme);
  const box = boxOf(flat, layout, theme, poles);
  if (box === null) return null;
  const drawn = renderPart(flat, layout, theme).replace(CAPTION_PATTERN, '');
  const marks = poles.map((pole) => poleText(pole, theme)).join('');
  return {
    svg: `<g transform="translate(${num(-box.x)} ${num(-box.y)})">${drawn}${marks}</g>`,
    width: box.width,
    height: box.height,
  };
}

/** これより短くするとリードが胴に隠れて、部品の姿が基板と違って見える。 */
const MIN_ICON_SPAN = 3;

/**
 * 表の欄に収まる絵 (収まるかは `fits` が決める)。長い部品が 1 つあるだけで全部の絵が欄から消えないよう、
 * 収まらないときは**長い部品のリードだけ**を、収まるぎりぎりの長さまで詰める。
 * 詰めても収まらなければそのままの絵を返す (表の側で欄を空ける)。
 */
export function partsIconsWithin(
  parts: readonly PlacedPart[],
  layout: Layout,
  theme: RenderTheme,
  fits: (icons: readonly (PartsIcon | null)[]) => boolean,
): readonly (PartsIcon | null)[] {
  const drawn = (maxSpan?: number) => parts.map((part) => partsIcon(part, layout, theme, maxSpan));
  const natural = drawn();
  if (fits(natural)) return natural;
  const spans = Array.from({ length: Math.max(0, layout.columns - MIN_ICON_SPAN + 1) }, (_, index) => layout.columns - index);
  return spans.map((span) => drawn(span)).find(fits) ?? natural;
}
