import type { Point } from '../types.ts';
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

export function renderWire(points: readonly Point[], color: string, theme: RenderTheme): WirePaint {
  const path = roundedPath(points, CORNER_RADIUS);
  if (!path) return NOTHING;

  const { wireWidth } = theme.metrics;
  const { wireHalo, hole } = theme.palette;

  // 配線の色は被覆の色そのものなのでテーマでは変えない。
  // 地に沈むテーマ (暗い板の黒線など) は、色を変えるかわりに縁取りを敷いて浮かせる。
  const halo = wireHalo
    ? element('path', {
        d: path, fill: 'none', stroke: wireHalo, 'stroke-width': num(wireWidth + HALO_MARGIN),
        'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: 0.75,
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
