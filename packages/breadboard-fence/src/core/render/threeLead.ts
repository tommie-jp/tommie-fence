import type { Layout } from '../model/layout.ts';
import type { PlacedPart, Point } from '../types.ts';
import { LEG_NAME_GAP, ROUND_CAPTION_GAP, caption, haloWidth, partLabel, pinPoints } from './partCommon.ts';
import { element, num, svgText } from './svg.ts';
import type { RenderTheme } from './theme.ts';

/**
 * 3 本足の部品。**足の並びは真ん中の足を中心に描く**。
 * パッケージの向き (TO-92 の平らな面、スイッチの倒れている側) は図では主張しない。
 * 品種や状態で変わるものを図に描くと嘘になるので、どの穴がどの足かをピン名で示す。
 */
export function bodyHalfHeight(type: string, layout: Layout): number {
  if (type === 'potentiometer') return 1.1 * layout.pitch;
  if (type === 'slide-switch') return 0.8 * layout.pitch;
  // TO-92 は幅 4.5mm ほど。穴のピッチ 2.54mm に対して直径 2 ピッチ弱に収める。
  return 0.95 * layout.pitch;
}

export function renderThreeLead(part: PlacedPart, layout: Layout, theme: RenderTheme): string {
  const points = pinPoints(part, layout);
  const center = points?.[1];
  if (!points || !center) return '';

  const { palette, metrics } = theme;
  const reach = bodyHalfHeight(part.type, layout);
  const towardRavine = center.y < layout.ravineY ? 1 : -1;

  const legs = points
    .map((point) =>
      element('rect', { x: num(point.x - 3), y: num(point.y - 3), width: 6, height: 6, fill: palette.chipPin }),
    )
    .join('');
  const names = part.pins
    .map((pin, index) => {
      const point = points[index];
      return point
        ? svgText(point.x, point.y - towardRavine * (reach + LEG_NAME_GAP), pin.name, {
            'font-size': num(metrics.textSize),
            'font-weight': 700,
            fill: palette.partText,
            halo: palette.textHalo,
            haloWidth: haloWidth(theme),
          })
        : '';
    })
    .join('');
  const label = partLabel(center.x, center.y + towardRavine * (reach + ROUND_CAPTION_GAP), caption(part), theme);

  return `${shellOf(part, center, reach, theme)}${legs}${names}${label}`;
}

function shellOf(part: PlacedPart, center: Point, reach: number, theme: RenderTheme): string {
  if (part.type === 'potentiometer') return potentiometerShell(center, reach);
  if (part.type === 'slide-switch') return slideSwitchShell(center, reach);
  return element('circle', {
    cx: num(center.x), cy: num(center.y), r: num(reach),
    fill: theme.palette.chipBody, stroke: '#14171c',
  });
}

/** 半固定抵抗。上から見た四角い本体と、回すためのねじの頭。 */
function potentiometerShell(center: Point, reach: number): string {
  const shell = element('rect', {
    x: num(center.x - reach * 1.2), y: num(center.y - reach), width: num(reach * 2.4), height: num(reach * 2), rx: 3,
    fill: '#2b6fd4', stroke: '#1b4a91',
  });
  const head = element('circle', {
    cx: num(center.x), cy: num(center.y), r: num(reach * 0.6), fill: '#dfe4ee', stroke: '#8a929c',
  });
  const slot = element('rect', {
    x: num(center.x - reach * 0.45), y: num(center.y - 1.6), width: num(reach * 0.9), height: 3.2, rx: 1.2,
    fill: '#5a6472',
  });
  return shell + head + slot;
}

/**
 * スライドスイッチ。**つまみは真ん中に描く**:
 * どちらに倒して使うかは図では決まらないので、片側に寄せると嘘になる。
 */
function slideSwitchShell(center: Point, reach: number): string {
  const shell = element('rect', {
    x: num(center.x - reach * 1.6), y: num(center.y - reach), width: num(reach * 3.2), height: num(reach * 2), rx: 3,
    fill: '#e8ebf0', stroke: '#8a929c',
  });
  const slot = element('rect', {
    x: num(center.x - reach * 1.1), y: num(center.y - 5), width: num(reach * 2.2), height: 10, rx: 5,
    fill: '#3f4650',
  });
  const knob = element('rect', {
    x: num(center.x - 5), y: num(center.y - 7.5), width: 10, height: 15, rx: 2,
    fill: '#b9bec7', stroke: '#6b7280',
  });
  return shell + slot + knob;
}
