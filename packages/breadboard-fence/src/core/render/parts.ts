import type { Layout } from '../model/layout.ts';
import type { PlacedPart, Point, Rect } from '../types.ts';
import { boardBodyRect, renderBoardPart } from './boardPart.ts';
import { renderDip, renderPushbutton, renderSip, sipBarRect, switchBodyRect } from './packages.ts';
import { CAPTION_DROP, CAPTION_HEIGHT, caption, charWidth, labelYOf } from './partCommon.ts';
import { bodyHalfHeight, bodyHalfWidth, renderThreeLead } from './threeLead.ts';
import { renderTwoLead } from './twoLead.ts';
import type { RenderTheme } from './theme.ts';
import { textScale } from './theme.ts';

/**
 * 配線に横切られたくない領域。2 本足の部品では本体そのものより、
 * 溝側に置いたラベルがレーンと同じ高さに来るのが問題になる。
 * 大きな部品 (パッケージ・ボード) は本体の外形をそのまま渡す。
 */
export function partObstacles(part: PlacedPart, layout: Layout, theme: RenderTheme): Rect[] {
  if (part.kind === 'board') return [boardBodyRect(part, layout)];
  if (part.kind === 'sip') return [sipBarRect(part, layout)];
  if (part.kind === 'switch') return [switchBodyRect(part, layout)];

  const points = part.pins
    .map((pin) => (pin.address ? layout.point(pin.address) : null))
    .filter((point): point is Point => point !== null);
  if (points.length === 0) return [];

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);

  if (part.kind === 'dip') {
    return [{ x: left - 9, y: top - 5, width: right - left + 18, height: bottom - top + 10 }];
  }

  if (part.kind === 'three-lead') {
    const halfHeight = bodyHalfHeight(part, layout);
    // 胴は姿によって縦より横に広い (TO-220・半固定抵抗・スライドスイッチ)。
    // 丸の半径で作っていたころは、その差のぶんだけ配線が本体の上を通っていた。
    const halfWidth = bodyHalfWidth(part, layout);
    const center = points[1] ?? points[0]!;
    // 本体に、上下へ出したピン名とラベルを足した高さ。字が伸びればここも伸びる。
    const reach = CAPTION_DROP * textScale(theme);
    return [{
      x: center.x - halfWidth,
      y: center.y - halfHeight - reach,
      width: halfWidth * 2,
      height: halfHeight * 2 + reach * 2,
    }];
  }

  const center = { x: (left + right) / 2, y: (top + bottom) / 2 };
  const width = Math.max(caption(part).length * charWidth(theme), right - left);
  const height = textScale(theme) * CAPTION_HEIGHT;
  const labelY = labelYOf(part, center, layout);

  return [{ x: center.x - width / 2, y: labelY - height + 3, width, height }];
}

export function renderPart(part: PlacedPart, layout: Layout, theme: RenderTheme): string {
  if (part.kind === 'dip') return renderDip(part, layout, theme);
  if (part.kind === 'sip') return renderSip(part, layout, theme);
  if (part.kind === 'switch') return renderPushbutton(part, layout, theme);
  if (part.kind === 'board') return renderBoardPart(part, layout, theme);
  if (part.kind === 'three-lead') return renderThreeLead(part, layout, theme);
  // 機器 (device) は帯の中に別の描き方で置くので、ここには来ない。
  return renderTwoLead(part, layout, theme);
}
