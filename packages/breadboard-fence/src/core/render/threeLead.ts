import type { Layout } from '../model/layout.ts';
import type { PlacedPart, Point } from '../types.ts';
import { LEG_NAME_GAP, ROUND_CAPTION_GAP, caption, fitToBoard, haloWidth, partLabel, pinPoints } from './partCommon.ts';
import { element, num, svgText } from './svg.ts';
import type { RenderTheme } from './theme.ts';

/**
 * 3 本足の部品。**足の並びは真ん中の足を中心に描く**。
 * パッケージの向き (TO-92 の平らな面、スイッチの倒れている側) は図では主張しない。
 * 品種や状態で変わるものを図に描くと嘘になるので、どの穴がどの足かをピン名で示す。
 */
export function bodyHalfHeight(part: PlacedPart, layout: Layout): number {
  if (part.type === 'potentiometer') return 1.1 * layout.pitch;
  if (part.type === 'slide-switch') return 0.8 * layout.pitch;
  // TO-220 は放熱タブのぶん胴が高い。実物 (10mm 角ほど) に寄せて丸より大きく取る。
  if (part.variant === 'to220') return 1.4 * layout.pitch;
  // TO-92 は幅 4.5mm ほど。穴のピッチ 2.54mm に対して直径 2 ピッチ弱に収める。
  return 0.95 * layout.pitch;
}

/**
 * 胴の横幅の半分。**丸い TO-92 以外は縦より横に広い**。
 * 配線がよける領域 (`render/parts.ts` の `partObstacles`) と、
 * 下のシェル描画の両方がここから幅を取る。**係数を 2 か所に持たない**:
 * 分けて持っていたころは障害物だけが丸の半径のままで、
 * 横に広い胴 (TO-220・半固定抵抗・スライドスイッチ) の上を配線が通っていた。
 */
export function bodyHalfWidth(part: PlacedPart, layout: Layout): number {
  const reach = bodyHalfHeight(part, layout);
  if (part.type === 'potentiometer') return reach * 1.2;
  if (part.type === 'slide-switch') return reach * 1.6;
  if (part.variant === 'to220') return reach * 1.15;
  return reach;
}

export function renderThreeLead(part: PlacedPart, layout: Layout, theme: RenderTheme): string {
  const points = pinPoints(part, layout);
  const center = points?.[1];
  if (!points || !center) return '';

  const { palette, metrics } = theme;
  const reach = bodyHalfHeight(part, layout);
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
  const text = fitToBoard(caption(part), center.x, theme.metrics.textSize, layout);
  const label = partLabel(center.x, center.y + towardRavine * (reach + ROUND_CAPTION_GAP), text, theme);

  return `${shellOf(part, center, reach, bodyHalfWidth(part, layout), towardRavine, theme)}${legs}${names}${label}`;
}

function shellOf(
  part: PlacedPart,
  center: Point,
  reach: number,
  halfWidth: number,
  towardRavine: number,
  theme: RenderTheme,
): string {
  if (part.type === 'potentiometer') return potentiometerShell(center, reach, halfWidth);
  if (part.type === 'slide-switch') return slideSwitchShell(center, reach, halfWidth);
  if (part.variant === 'to220') return to220Shell(center, reach, halfWidth, towardRavine, theme);
  return element('circle', {
    cx: num(center.x), cy: num(center.y), r: num(reach),
    fill: theme.palette.chipBody, stroke: '#14171c',
  });
}

/**
 * TO-220。放熱タブつきの角い胴で、TO-92 の丸とは大きさも形も違う。
 * **タブは溝側に描く**: 反対側にはピン名が並ぶため。
 * どちら向きに寝かせるか (タブが上か下か) は実装の都合で、実物の向きの主張ではない。
 */
function to220Shell(
  center: Point,
  reach: number,
  halfWidth: number,
  towardRavine: number,
  theme: RenderTheme,
): string {
  const tabHeight = reach * 0.8;
  const tabY = towardRavine > 0 ? center.y + reach - tabHeight : center.y - reach;

  const plastic = element('rect', {
    x: num(center.x - halfWidth), y: num(center.y - reach),
    width: num(halfWidth * 2), height: num(reach * 2), rx: 3,
    fill: '#23272e', stroke: '#12151a',
  });
  const tab = element('rect', {
    x: num(center.x - halfWidth), y: num(tabY), width: num(halfWidth * 2), height: num(tabHeight), rx: 2,
    fill: '#b9c0c9', stroke: '#7c848e',
  });
  // 取り付けねじの穴。板の色で抜くと、下の穴の並びと紛れない。
  const hole = element('circle', {
    cx: num(center.x), cy: num(tabY + tabHeight / 2), r: num(reach * 0.2), fill: theme.palette.plate,
  });
  return plastic + tab + hole;
}

/** 半固定抵抗。上から見た四角い本体と、回すためのねじの頭。 */
function potentiometerShell(center: Point, reach: number, halfWidth: number): string {
  const shell = element('rect', {
    x: num(center.x - halfWidth), y: num(center.y - reach), width: num(halfWidth * 2), height: num(reach * 2), rx: 3,
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

/** つまみが走る溝の幅。胴の内側に収めて、端で切れないようにする。 */
const SLOT_WIDTH_RATIO = 0.6875;

/**
 * スライドスイッチ。**つまみは真ん中に描く**:
 * どちらに倒して使うかは図では決まらないので、片側に寄せると嘘になる。
 */
function slideSwitchShell(center: Point, reach: number, halfWidth: number): string {
  const shell = element('rect', {
    x: num(center.x - halfWidth), y: num(center.y - reach), width: num(halfWidth * 2), height: num(reach * 2), rx: 3,
    fill: '#e8ebf0', stroke: '#8a929c',
  });
  const slotHalf = halfWidth * SLOT_WIDTH_RATIO;
  const slot = element('rect', {
    x: num(center.x - slotHalf), y: num(center.y - 5), width: num(slotHalf * 2), height: 10, rx: 5,
    fill: '#3f4650',
  });
  const knob = element('rect', {
    x: num(center.x - 5), y: num(center.y - 7.5), width: 10, height: 15, rx: 2,
    fill: '#b9bec7', stroke: '#6b7280',
  });
  return shell + slot + knob;
}
