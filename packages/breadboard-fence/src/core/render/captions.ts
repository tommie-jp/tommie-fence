import type { Layout } from '../model/layout.ts';
import type { PlacedPart, Point, Rect } from '../types.ts';
import { boardBodyRect } from './boardPart.ts';
import { fourLeadBodyRect, switchBodyRect } from './packages.ts';
import {
  CAPTION_CLEAR, CAPTION_HEIGHT, LEG_NAME_CLEAR, NAME_CAP, NAME_LINE,
  caption, charWidth, labelYOf, pinPoints,
} from './partCommon.ts';
import { bodyHalfHeight } from './threeLead.ts';
import type { RenderTheme } from './theme.ts';
import { textScale } from './theme.ts';

/**
 * 名札をどこに置くか。**描画と配線よけで同じ答えを使う**ので、勘定はここ 1 つ。
 *
 * 名札は胴の下と決まっているが (実機で「すべての部品名は部品の下側に表示する」)、
 * 隣り合う行に部品を置くと**下の部品の名札と上の部品の名札が同じ高さに並ぶ**。
 * 3 本足は足の名前の 1 行下に名札が来るので、1 行違いでもぶつかる
 * (実機の 09-am-radio で `Q1 2SC1815` と `D1 1N60` が重なっていた)。
 * ぶつかったほうを 1 行ずつ下げて逃がす。
 */

/** 逃がす段の高さ。字 1 行ぶん (足の名前と名札の送りと同じ)。 */
const DROP_LINE = NAME_LINE;

/** 下げる上限。これ以上下げると、どの部品の名前か分からなくなる。 */
const DROP_LIMIT = 2;

/**
 * 名札 1 つが占める帯。**中に刷る種類 (DIP・SIP) は `null`** — 樹脂の上に
 * 書くので、板の上の字とはぶつからない。
 */
export function captionBandOf(
  part: PlacedPart,
  layout: Layout,
  theme: RenderTheme,
  drop = 0,
): Rect | null {
  const baseline = captionBaselineOf(part, layout, theme);
  if (baseline === null) return null;
  return band(baseline.x, baseline.y + drop * theme.metrics.textSize * DROP_LINE, baseline.width, theme);
}

/** 名札の基準線と、その中心・幅。置く側 (描画) と数える側 (配線よけ) で同じ式を使う。 */
export function captionBaselineOf(
  part: PlacedPart,
  layout: Layout,
  theme: RenderTheme,
): { readonly x: number; readonly y: number; readonly width: number } | null {
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
  // DIP と SIP は樹脂の上に刷る (板の字と食い合わない)。機器は帯の中で別に置く。
  if (part.kind === 'dip' || part.kind === 'sip' || part.kind === 'device') return null;

  const points = pinPoints(part, layout);
  if (!points || points.length === 0) return null;

  if (part.kind === 'three-lead') {
    const centre = points[1] ?? points[0]!;
    // 足の名前の 1 行下 (`threeLead.ts` と同じ勘定)。
    const legs = centre.y + bodyHalfHeight(part, layout) + LEG_NAME_CLEAR + cap;
    return { x: centre.x, y: legs + theme.metrics.textSize * NAME_LINE, width };
  }

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
  // **先に場所を取っているもの** (板に書いた注釈)。番地で置き場所を指定した
  // ほうが強く、自動で置く名札が避ける。
  taken: readonly Rect[] = [],
): ReadonlyMap<string, number> {
  const drops = new Map<string, number>();
  const placed: Rect[] = [...taken];
  for (const part of parts) {
    let drop = 0;
    let box = captionBandOf(part, layout, theme, drop);
    if (box === null) continue;
    while (drop < DROP_LIMIT && placed.some((taken) => overlaps(taken, box!))) {
      drop += 1;
      box = captionBandOf(part, layout, theme, drop);
    }
    if (box !== null) placed.push(box);
    if (drop > 0) drops.set(part.id, drop);
  }
  return drops;
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

/**
 * 字が図の上で占める横幅。**コードポイントで数え、ラテン文字より広いものは 2 文字ぶん**。
 * 狭く見るほうが危ない側で、塞ぎ損ねた字の上を配線が走る。
 */
export const captionWidth = (part: PlacedPart, theme: RenderTheme): number =>
  [...caption(part)].reduce((sum, char) => sum + ((char.codePointAt(0) ?? 0) > 0xff ? 2 : 1), 0)
  * charWidth(theme);
