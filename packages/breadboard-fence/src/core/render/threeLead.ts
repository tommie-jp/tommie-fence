import type { Layout } from '../model/layout.ts';
import type { PlacedPart } from '../types.ts';
import { LEG_NAME_GAP, ROUND_CAPTION_GAP, caption, fitToBoard, haloWidth, partLabel, pinPoints } from './partCommon.ts';
import { drawPackage, packageHalfWidth, packageReach } from 'fence-kit';
import { element, num, svgText } from './svg.ts';
import type { RenderTheme } from './theme.ts';

/**
 * 3 本足の部品。**足の並びは真ん中の足を中心に描く**。
 *
 * **パッケージの姿は fence-kit にある** (`parts/packages.ts`)。実物の話で板に
 * 依らないので、perfboard と同じ絵になる (52 の docs/18)。ここに残るのは板の
 * 話 — 足の点、ピン名、キャプション、どちら側に寄せるか。
 * パッケージの向き (TO-92 の平らな面、スイッチの倒れている側) は図では主張しない。
 * 品種や状態で変わるものを図に描くと嘘になるので、どの穴がどの足かをピン名で示す。
 */
export const bodyHalfHeight = (part: PlacedPart, layout: Layout): number =>
  packageReach(part, layout.pitch);

/**
 * 胴の横幅の半分。**丸い TO-92 以外は縦より横に広い**。
 * 配線がよける領域 (`render/parts.ts` の `partObstacles`) と、
 * 下のシェル描画の両方がここから幅を取る。**係数を 2 か所に持たない**:
 * 分けて持っていたころは障害物だけが丸の半径のままで、
 * 横に広い胴 (TO-220・半固定抵抗・スライドスイッチ) の上を配線が通っていた。
 */
export const bodyHalfWidth = (part: PlacedPart, layout: Layout): number =>
  packageHalfWidth(part, layout.pitch);

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

  const shell = drawPackage(part, {
    cx: center.x,
    cy: center.y,
    reach,
    halfWidth: bodyHalfWidth(part, layout),
    // **キャプションとタブを置く側** = 溝の側。ピン名は反対に並ぶ。
    side: towardRavine > 0 ? 1 : -1,
    plate: theme.palette.plate,
    chipBody: theme.palette.chipBody,
  });
  return `${shell}${legs}${names}${label}`;
}

