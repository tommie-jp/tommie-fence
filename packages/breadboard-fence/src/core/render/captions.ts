import type { Layout } from '../model/layout.ts';
import type { PlacedPart, Point, Rect } from '../types.ts';
import { boardBodyRect } from './boardPart.ts';
import { connectorCaptionAt } from './connector.ts';
import { fourLeadBodyRect, switchBodyRect } from './packages.ts';
import {
  CAPTION_CLEAR, CAPTION_HEIGHT, NAME_CAP, NAME_LINE,
  captionTextWidth, haloWidth, labelYOf, pinPoints,
} from './partCommon.ts';
import { bodyHalfHeight, bodyHalfWidth, legNameBoxes, threeLeadCaptionAt, threeLeadCaptionSpots } from './threeLead.ts';
import type { RenderTheme } from './theme.ts';
import { textScale } from './theme.ts';

/**
 * 名札をどこに置くか。**描画と配線よけで同じ答えを使う**ので、勘定はここ 1 つ。
 *
 * 名札は胴の下と決まっているが (実機で「すべての部品名は部品の下側に表示する」)、
 * 隣り合う行に部品を置くと**下の部品の名札と上の部品の名札が同じ高さに並ぶ**。
 * 3 ピンはピンの名前の 1 行下に名札が来るので、1 行違いでもぶつかる
 * (実機の 09-am-radio で `Q1 2SC1815` と `D1 1N60` が重なっていた)。
 * ぶつかったほうを 1 行ずつ下げて逃がす。
 */

/** 逃がす段の高さ。字 1 行ぶん (ピンの名前と名札の送りと同じ)。 */
const DROP_LINE = NAME_LINE;

/** 下げる上限。これ以上下げると、どの部品の名前か分からなくなる。 */
const DROP_LIMIT = 2;

/**
 * 名札 1 つが占める帯。**中に刷る種類 (DIP・SIP) は `null`** — 樹脂の上に
 * 書くので、基板の上の字とはぶつからない。
 */
export function captionBandOf(
  part: PlacedPart,
  layout: Layout,
  theme: RenderTheme,
  drop = 0,
): Rect | null {
  const spot = captionSpotOf(part, layout, theme, drop);
  return spot === null ? null : band(spot.x, spot.y, spot.width, theme);
}

/**
 * 名札の基準線 (段を下げたあと)。**3 ピンは段の番号で置き場の候補を選ぶ**
 * (`threeLeadCaptionAt`)。ほかは基準線から段の数だけ下げる。
 */
function captionSpotOf(part: PlacedPart, layout: Layout, theme: RenderTheme, drop: number): CaptionBaseline | null {
  if (part.kind === 'three-lead') return threeLeadCaptionAt(part, layout, theme, captionWidth(part, theme), drop);
  const baseline = captionBaselineOf(part, layout, theme);
  return baseline === null ? null : { ...baseline, y: baseline.y + drop * theme.metrics.textSize * DROP_LINE };
}

/**
 * 名札の**字そのもの**が占める帯。`captionBandOf` は配線よけのためにピンの幅まで
 * 広げてあるが、基板の穴を伏せるのは字の下だけでよい — ピンの下の穴まで消すと、
 * 部品の脇の行に穴の無い帯ができる。
 */
export function captionTextBandOf(
  part: PlacedPart,
  layout: Layout,
  theme: RenderTheme,
  drop = 0,
): Rect | null {
  const baseline = captionSpotOf(part, layout, theme, drop);
  if (baseline === null) return null;
  const { y } = baseline;
  const width = captionWidth(part, theme);
  // **行と行の間に置いた名札** (3 ピンの、ピンの名前の横) は字の背丈 (大文字の高さ) だけを
  // 伏せる。1 行ぶんの帯で数えると、上下の行の穴まで伏せてしまう。
  if (baseline.betweenRows === true) {
    const cap = theme.metrics.textSize * NAME_CAP;
    const edge = haloWidth(theme) / 2;
    return { x: baseline.x - width / 2 - edge, y: y - cap - edge, width: width + edge * 2, height: cap + edge * 2 };
  }
  const letters = band(baseline.x, y, width, theme);
  // **縁取りのぶん広げる。** 縁取りは字の外へはみ出して穴の端を削るので、
  // 字の幅だけで穴を選ぶと、縁取りに削られた穴の欠片が字の脇に残る。
  const pad = haloWidth(theme) / 2 + 1;
  return { x: letters.x - pad, y: letters.y - pad, width: letters.width + pad * 2, height: letters.height + pad * 2 };
}

export type CaptionBaseline = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  /** 穴の行と行の間に置いた (字の下の穴を伏せなくてよい)。 */
  readonly betweenRows?: boolean;
};

/** 名札の基準線と、その中心・幅。置く側 (描画) と数える側 (配線よけ) で同じ式を使う。 */
export function captionBaselineOf(
  part: PlacedPart,
  layout: Layout,
  theme: RenderTheme,
): CaptionBaseline | null {
  const cap = theme.metrics.textSize * NAME_CAP;
  const width = captionWidth(part, theme);

  if (part.kind === 'board') {
    const body = boardBodyRect(part, layout);
    return { x: body.x + body.width / 2, y: body.y + body.height + CAPTION_CLEAR + cap, width };
  }
  if (part.kind === 'switch') {
    const body = switchBodyRect(part, layout);
    return { x: body.x + body.width / 2, y: body.y + body.height + CAPTION_CLEAR + cap, width };
  }
  if (part.kind === 'four-lead') {
    const body = fourLeadBodyRect(part, layout);
    return { x: body.x + body.width / 2, y: body.y + body.height + CAPTION_CLEAR + cap, width };
  }
  if (part.kind === 'connector') {
    const at = connectorCaptionAt(part, layout, theme);
    return at === null ? null : { ...at, width };
  }
  // DIP と SIP は樹脂の上に刷る (基板の字と食い合わない)。機器は帯の中で別に置く。
  if (part.kind === 'dip' || part.kind === 'sip' || part.kind === 'device') return null;

  const points = pinPoints(part, layout);
  if (!points || points.length === 0) return null;

  if (part.kind === 'three-lead') return threeLeadCaptionAt(part, layout, theme, width, 0);

  const centre = middleOf(points);
  return {
    x: centre.x,
    y: labelYOf(part, centre, layout, theme),
    width: Math.max(width, Math.max(...points.map((point) => point.x)) - Math.min(...points.map((point) => point.x))),
  };
}

/**
 * 部品ごとに名札を何段下げるか。**書かれた順に置いて、ぶつかったほうが下がる** —
 * 先に書いた部品の名札は動かないので、1 行足しても図の他の場所は動かない。
 */
export function captionDrops(
  parts: readonly PlacedPart[],
  layout: Layout,
  theme: RenderTheme,
  // **先に場所を取っているもの** (基板に書いた注釈)。番地で置き場所を指定した
  // ほうが強く、自動で置く名札が避ける。
  taken: readonly Rect[] = [],
): ReadonlyMap<string, number> {
  const drops = new Map<string, number>();
  const placed: Rect[] = [...taken];
  // 3 ピンのピンの名前は動かないので、先に場所を取っている (自分の名前とは数えない)。
  // 空ける字数: 3 ピンの名札は 3 字 — 自分の名札 (名前から 2 字) より近いと、
  // `E  Q2 2SD880  B` のようにどちらの部品の名札か読めなくなる。ほかの名札は 1 字
  // (`E D1 1N60` と続けて読めなければよい。広く取ると 2 ピンの名札が無駄に下がる)。
  const legNamesOf = (margin: number): Rect[][] =>
    parts.map((part) => (part.kind === 'three-lead' ? legNameBoxes(part, layout, theme, margin) : []));
  const legNames = { near: legNamesOf(1), far: legNamesOf(3) };
  for (const [index, part] of parts.entries()) {
    const others = legNames[part.kind === 'three-lead' ? 'far' : 'near'].filter((_, at) => at !== index).flat();
    // 3 ピンはピンの名前の横を先に試す。**ほかの部品の胴にも掛けない** — 横に置くと、
    // 隣の行に寝かせた部品 (09-am-radio の D1) の上に名札が乗る。
    const spots = part.kind === 'three-lead' ? threeLeadCaptionSpots(part, layout, theme, captionWidth(part, theme)).length : 1;
    const bodies = spots > 1 ? parts.filter((other) => other !== part).flatMap((other) => footprintOf(other, layout)) : [];
    const limit = spots - 1 + DROP_LIMIT;
    const blocked = (box: Rect): boolean => [...placed, ...others, ...bodies].some((one) => overlaps(one, box));
    let drop = 0;
    let box = captionBandOf(part, layout, theme, drop);
    if (box === null) continue;
    while (drop < limit && blocked(box!)) {
      drop += 1;
      box = captionBandOf(part, layout, theme, drop);
    }
    if (box !== null) placed.push(box);
    if (drop > 0) drops.set(part.id, drop);
  }
  return drops;
}

/**
 * 部品の胴とピンがおおよそ占める所 (ピンの穴の外接矩形を少し広げたもの)。3 ピンの名札の
 * 置き場を選ぶときだけ見る。2 ピンの胴はピンを結ぶ線の上に乗る。
 */
function footprintOf(part: PlacedPart, layout: Layout): Rect[] {
  if (part.kind === 'device') return [];
  const points = pinPoints(part, layout);
  if (!points || points.length === 0) return [];
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const [padX, padY] = part.kind === 'three-lead'
    ? [bodyHalfWidth(part, layout), bodyHalfHeight(part, layout)]
    : [layout.pitch * 0.4, layout.pitch * 0.4];
  const left = Math.min(...xs) - padX;
  const top = Math.min(...ys) - padY;
  return [{ x: left, y: top, width: Math.max(...xs) + padX - left, height: Math.max(...ys) + padY - top }];
}

/** 名札が下がる距離 (px)。描く側はこれを基準線に足すだけ。 */
export const captionDropOf = (
  drops: ReadonlyMap<string, number> | undefined,
  part: PlacedPart,
  theme: RenderTheme,
): number => (drops?.get(part.id) ?? 0) * theme.metrics.textSize * DROP_LINE;

const middleOf = (points: readonly Point[]): Point => ({
  x: (Math.min(...points.map((point) => point.x)) + Math.max(...points.map((point) => point.x))) / 2,
  y: (Math.min(...points.map((point) => point.y)) + Math.max(...points.map((point) => point.y))) / 2,
});

/** 字 1 行が占める帯。`baseline` は字の基準線で、字はそこから上へ伸びる。 */
export function band(centerX: number, baseline: number, width: number, theme: RenderTheme): Rect {
  const height = textScale(theme) * CAPTION_HEIGHT;
  return { x: centerX - width / 2, y: baseline - height + 3, width, height };
}

const overlaps = (a: Rect, b: Rect): boolean =>
  Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 0
  && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 0;

/** 字が図の上で占める横幅 (`partCommon.ts` の `captionTextWidth`)。 */
export const captionWidth = captionTextWidth;
