import type { Layout } from '../model/layout.ts';
import type { PlacedPart, Point } from '../types.ts';
import { TEXT_HALO_WIDTH, num, svgText } from './svg.ts';
import type { TextOptions } from './svg.ts';
import type { RenderTheme } from './theme.ts';
import { BASE_HOLE_SIZE, textScale } from './theme.ts';

/** 部品の種類ごとの描画で共有する寸法と字の置き方。 */
export const LEAD_WIDTH = 2;
export const CHAR_WIDTH = 5.6;
export const CAPTION_HEIGHT = 14;

// ラベルは穴 1 つぶんの隙間 (20) に置く。字を大きくしても**ベースラインは動かさない**:
// 字は基準線から上へ伸びるので隙間を上に使い、下げると隣の穴の列に食い込む。
export const CAPTION_DROP = 18;
const CAPTION_RISE = 14;
// LED は本体の丸が大きいぶん、上に置くラベルを少し離す。
const LED_CAPTION_RISE = 21;
export const LEG_NAME_GAP = 9;
export const ROUND_CAPTION_GAP = 14;

// ラベルと値の長さはパーサ側 (limits.ts) で切ってあるので、ここでは組み立てるだけ。
export const caption = (part: PlacedPart): string => [part.id, part.value ?? part.label ?? ''].join(' ').trim();

export const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

export const charWidth = (theme: RenderTheme): number => textScale(theme) * CHAR_WIDTH;

/**
 * ラベルの縁取りの太さ。ラベルは必ず隣の穴の列にかかる位置に来るので、
 * **縁取りがその穴を消しきれる太さでなければ字が穴に食われる**。
 * 字が伸びれば覆う範囲が広がり、穴が大きくなれば消すべき量も増えるので、両方で決める。
 */
export const haloWidth = (theme: RenderTheme): number =>
  TEXT_HALO_WIDTH * textScale(theme) + (theme.metrics.holeSize - BASE_HOLE_SIZE) * 1.25;

/** ラベルは溝の側に置く。盤の端は列番号の印字があり、そこに重ねると両方読めなくなる。 */
export function labelYOf(part: PlacedPart, center: Point, layout: Layout): number {
  if (center.y < layout.ravineY) return center.y + CAPTION_DROP;
  return center.y - (part.type === 'led' ? LED_CAPTION_RISE : CAPTION_RISE);
}

/** 板と穴の上に載る部品の字。縁取りを敷いて、下の穴に食われないようにする。 */
export const partLabel = (
  x: number,
  y: number,
  text: string,
  theme: RenderTheme,
  extra: TextOptions = {},
): string =>
  svgText(x, y, text, {
    'font-size': num(theme.metrics.textSize),
    fill: theme.palette.partText,
    halo: theme.palette.textHalo,
    haloWidth: haloWidth(theme),
    ...extra,
  });

/** その部品のピンが落ちた画布の座標。1 本でも置けていなければ null (描かない)。 */
export function pinPoints(part: PlacedPart, layout: Layout): Point[] | null {
  const points = part.pins.map((pin) => (pin.address ? layout.point(pin.address) : null));
  return points.every((point): point is Point => point !== null) ? points : null;
}

export const pointOfPin = (part: PlacedPart, name: string, layout: Layout): Point | null => {
  const pin = part.pins.find((candidate) => candidate.name === name);
  return pin?.address ? layout.point(pin.address) : null;
};
