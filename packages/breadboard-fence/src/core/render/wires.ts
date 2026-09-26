import type { Point } from '../types.ts';
import { DEFAULT_WIRE_COLOR } from './palette.ts';
import type { RenderTheme } from './theme.ts';
import { element, num, roundedPath } from './svg.ts';

const CORNER_RADIUS = 10;
/** 既定の太さ 3.4 に対する端点の半径 2.8。太さを変えても粒が線に埋もれないよう比で持つ。 */
const END_RADIUS_RATIO = 2.8 / 3.4;
/**
 * 縁取りが線の両側に出る幅。細い線として見える最小限に留める。
 * 広げると被覆の色より縁のほうが目立ってしまい、色で配線を追えなくなる。
 */
const HALO_MARGIN = 1.6;

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
  const { wireHalo, hole, plate } = theme.palette;

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
  const line = element('path', {
    d: path, fill: 'none', stroke: color, 'stroke-width': num(wireWidth), 'stroke-linecap': 'round', opacity: 0.92,
  });
  const ends = [points[0], points[points.length - 1]]
    .map((point) =>
      point
        ? element('circle', {
            cx: num(point.x), cy: num(point.y), r: num(wireWidth * END_RADIUS_RATIO), fill: hole,
          })
        : '',
    )
    .join('');

  return { halo, line: line + ends };
}
