import type { Point } from '../types.ts';
import { DEFAULT_WIRE_COLOR } from './palette.ts';
import type { RenderTheme } from './theme.ts';
import { element, num, roundedPath } from './svg.ts';

const CORNER_RADIUS = 10;
/** 穴の中央に置く金属の粒の半径 (太さに対する比)。暗い穴の上で金属の先が見えるよう、穴より小さくする。 */
const END_RADIUS_RATIO = 0.55;
/**
 * 縁取りが線の両側に出る幅。細い線として見える最小限に留める。
 * 広げると被覆の色より縁のほうが目立ってしまい、色で配線を追えなくなる。
 */
const HALO_MARGIN = 1.6;
/**
 * 端で被覆を剥いた長さ。穴に挿す所は金属の線が穴の中央まで出ているように描く
 * (機器の足と同じ見え方。被覆の色が穴まで来ると、どこに挿さっているか読みにくかった)。
 */
const BARE_TIP = 9;
/** 剥いた先の金属の太さ (被覆に対する比)。 */
const BARE_WIDTH_RATIO = 0.6;

/**
 * 1 本の配線を、下に敷く縁取りと線本体に分けて返す。
 * **分けるのは、縁取りが交差した相手の線を塗り潰さないようにするため。**
 * 全部の縁取りを先に敷いてから線を重ねる (呼ぶ側がその順で並べる)。
 */
export type WirePaint = { readonly halo: string; readonly line: string };

const NOTHING: WirePaint = { halo: '', line: '' };

/**
 * 板に沈む線の縁取り。**テーマが縁取りを持たないとき** (classic・presentation) に、
 * 線ごとに決める。
 *
 * - **板との差が小さい色** (`white`) は、板と同じ明るさで線そのものが見えない
 *   (実機の AD の図で、2− の白線がどこへ行くのか読めなかった)。
 * - **既定の灰色** (色を書かなかった線) は、部品の足 (`lead`) とほぼ同じ色で、
 *   足と配線の区別が付かない。縁で「被覆のある線」の姿にして足と分ける。
 *
 * 色は変えない (被覆の色そのもので、テーマで変えると図が嘘になる)。縁は濃い灰色で、
 * 被覆の色より細く見えるだけの幅に留める。
 */
export const WIRE_OUTLINE = '#5b636d';
/** これより板との明るさの比が小さい色は縁取る。白 (1.05) は入り、黄 (1.7) は入らない。 */
const OUTLINE_CONTRAST = 1.5;
/** 縁取りが線の両側に出る幅の合計。背景と同じ色の線でも輪郭が 2 本の細線として読める。 */
const OUTLINE_MARGIN = 2.2;

export function wireOutline(color: string, plate: string): string | null {
  if (color.toLowerCase() === DEFAULT_WIRE_COLOR.toLowerCase()) return WIRE_OUTLINE;
  const [a, b] = [luminance(color), luminance(plate)];
  if (a === null || b === null) return null;
  const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  return ratio < OUTLINE_CONTRAST ? WIRE_OUTLINE : null;
}

/** 相対輝度 (WCAG)。`#rrggbb` だけを読む。 */
function luminance(hex: string): number | null {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) return null;
  const value = Number.parseInt(match[1]!, 16);
  const [r, g, b] = [(value >> 16) & 255, (value >> 8) & 255, value & 255].map((channel) => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function renderWire(points: readonly Point[], color: string, theme: RenderTheme): WirePaint {
  const path = roundedPath(points, CORNER_RADIUS);
  if (!path) return NOTHING;

  const { wireWidth } = theme.metrics;
  const { wireHalo, plate, chipPin } = theme.palette;

  // 配線の色は被覆の色そのものなのでテーマでは変えない。
  // 地に沈むテーマ (暗い板の黒線など) は、色を変えるかわりに縁取りを敷いて浮かせる。
  // テーマが縁取りを持たなければ、沈む線だけを縁取る (`wireOutline`)。
  const outline = wireHalo ? null : wireOutline(color, plate);
  const halo = wireHalo
    ? element('path', {
        d: path, fill: 'none', stroke: wireHalo, 'stroke-width': num(wireWidth + HALO_MARGIN),
        'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: 0.75,
      })
    : outline
      ? element('path', {
          d: path, fill: 'none', stroke: outline, 'stroke-width': num(wireWidth + OUTLINE_MARGIN),
          'stroke-linecap': 'round', 'stroke-linejoin': 'round',
        })
      : '';
  // 芯線 (金属) を穴から穴まで敷き、その上に両端を剥いた被覆を重ねる。
  const core = element('path', {
    d: path, fill: 'none', stroke: chipPin, 'stroke-width': num(wireWidth * BARE_WIDTH_RATIO),
    'stroke-linecap': 'round', 'stroke-linejoin': 'round',
  });
  const covered = roundedPath(stripEnds(points), CORNER_RADIUS) ?? path;
  const line = element('path', {
    d: covered, fill: 'none', stroke: color, 'stroke-width': num(wireWidth), 'stroke-linecap': 'round', opacity: 0.92,
  });
  const ends = [points[0], points[points.length - 1]]
    .map((point) =>
      point
        ? insertionDot(point, theme)
        : '',
    )
    .join('');

  return { halo, line: core + line + ends };
}

/**
 * 穴に挿した所の金属の粒。配線の端と部品の足の端で同じものを置き、
 * どこに挿さっているかを同じ見え方で示す。
 */
export function insertionDot(point: Point, theme: RenderTheme): string {
  return element('circle', {
    cx: num(point.x), cy: num(point.y), r: num(theme.metrics.wireWidth * END_RADIUS_RATIO), fill: theme.palette.chipPin,
  });
}

/** 端の点から隣の点へ `length` だけ進んだ点。区間が短ければ区間の半分で止める。 */
function stepToward(end: Point, next: Point, length: number): Point {
  const dx = next.x - end.x;
  const dy = next.y - end.y;
  const span = Math.hypot(dx, dy);
  if (span === 0) return end;
  const step = Math.min(length, span / 2) / span;
  return { x: end.x + dx * step, y: end.y + dy * step };
}

/** 両端を剥いた長さだけ縮めた点の並び (元の並びは変えない)。 */
function stripEnds(points: readonly Point[]): readonly Point[] {
  if (points.length < 2) return points;
  const first = stepToward(points[0]!, points[1]!, BARE_TIP);
  const last = stepToward(points[points.length - 1]!, points[points.length - 2]!, BARE_TIP);
  return [first, ...points.slice(1, -1), last];
}
