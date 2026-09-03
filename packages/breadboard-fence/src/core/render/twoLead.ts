import { drawBody, drawsOwnLeads } from 'fence-kit';
import type { Layout } from '../model/layout.ts';
import type { PlacedPart } from '../types.ts';
import { LEAD_WIDTH, caption, fitToBoard, labelYOf, midpoint, partLabel } from './partCommon.ts';
import { element, num } from './svg.ts';
import type { RenderTheme } from './theme.ts';

/**
 * 2 本足の部品。**本体は 2 つの穴を結ぶ線の上に、その傾きのまま描く**ので、
 * 各部品の形は「原点が中央・x 軸が足の向き」の座標で書けばよい。
 *
 * **胴の姿そのものは fence-kit にある** (`parts/bodies.ts`)。実物の部品の話で
 * 板に依らないので、perfboard と同じものを使う (52 の docs/18)。ここに残るのは
 * 板の話 — 足の線、キャプションの置き場、傾きと位置。
 */
export function renderTwoLead(part: PlacedPart, layout: Layout, theme: RenderTheme): string {
  const [first, second] = part.pins;
  if (!first?.address || !second?.address) return '';

  const { palette } = theme;
  const from = layout.point(first.address);
  const to = layout.point(second.address);
  const center = midpoint(from, to);
  const angle = (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
  const span = Math.hypot(to.x - from.x, to.y - from.y);

  // **自分で足を描く胴には引かない** (水晶)。穴を渡る線が実物に無いため。
  const lead = drawsOwnLeads(part.type) ? '' : element('line', {
    x1: num(from.x), y1: num(from.y), x2: num(to.x), y2: num(to.y),
    stroke: palette.lead, 'stroke-width': LEAD_WIDTH,
  });
  const text = fitToBoard(caption(part), center.x, theme.metrics.textSize, layout);
  const label = partLabel(center.x, labelYOf(part, center, layout), text, theme);
  // 3 引数 rotate() を読まないレンダラがあるので translate と rotate に分ける。
  const body = element(
    'g',
    { transform: `translate(${num(center.x)} ${num(center.y)}) rotate(${num(angle)})` },
    drawBody(part, span),
  );

  return `${lead}${body}${label}`;
}

