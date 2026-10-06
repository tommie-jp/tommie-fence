import { drawBody, drawsOwnLeads } from 'fence-kit';
import type { Layout } from '../model/layout.ts';
import type { PlacedPart } from '../types.ts';
import { caption, captionAt, fitToBoard, labelYOf, partLabel, shiftOffsetOf, shiftedCentreOf } from './partCommon.ts';
import type { CaptionSpot } from './partCommon.ts';
import { element, num } from './svg.ts';
import { insertionDot } from './wires.ts';
import type { RenderTheme } from './theme.ts';

/**
 * 2 ピンの部品。**本体は 2 つの穴を結ぶ線の上に、その傾きのまま描く**ので、
 * 各部品の形は「原点が中央・x 軸がピンの向き」の座標で書けばよい。
 *
 * **胴の姿そのものは fence-kit にある** (`parts/bodies.ts`)。実物の部品の話で
 * 基板に依らないので、perfboard と同じものを使う (52 の docs/18)。ここに残るのは
 * 基板の話 — ピンの線、キャプションの置き場、傾きと位置。
 */
export function renderTwoLead(
  part: PlacedPart,
  layout: Layout,
  theme: RenderTheme,
  drop = 0,
  // 書いて決めた名札の置き場所 (`cap=`)。あれば下へ置く代わりにここへ。
  spot: CaptionSpot | null = null,
): string {
  const [first, second] = part.pins;
  if (!first?.address || !second?.address) return '';

  const { palette } = theme;
  const from = layout.point(first.address);
  const to = layout.point(second.address);
  // **胴を半穴ずらしたとき (`shift=`) は、胴とリードの直線だけを動かす。** ピンの穴は動かない。
  const offset = shiftOffsetOf(part, layout);
  const shifted = offset.x !== 0 || offset.y !== 0;
  const center = shiftedCentreOf(part, [from, to], layout);
  const angle = (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
  const span = Math.hypot(to.x - from.x, to.y - from.y);

  // **自分でピンを描く胴には引かない** (水晶)。穴を渡る線が実物に無いため。
  // ずらしたときのリードは、穴から胴の高さへ曲げ、胴の高さで渡して、もう一方の穴へ曲げ戻す。
  // ずらさない部品は今までどおり 1 本の直線 (書き出す SVG を変えない)。
  const wire = shifted
    ? element('polyline', {
      points: [from, { x: from.x + offset.x, y: from.y + offset.y }, { x: to.x + offset.x, y: to.y + offset.y }, to]
        .map((point) => `${num(point.x)},${num(point.y)}`).join(' '),
      fill: 'none', stroke: palette.lead, 'stroke-width': num(theme.metrics.wireWidth),
      'stroke-linecap': 'round', 'stroke-linejoin': 'round',
    })
    : element('line', {
      x1: num(from.x), y1: num(from.y), x2: num(to.x), y2: num(to.y),
      stroke: palette.lead, 'stroke-width': num(theme.metrics.wireWidth), 'stroke-linecap': 'round',
    });
  const lead = drawsOwnLeads(part.type) ? '' : wire + insertionDot(from, theme) + insertionDot(to, theme);
  // 書いて決めた置き場所 (`cap=`) の字は切り詰めない — 縦書きや端に寄せた字は、横の余白で
  // 測ると縮んで消え、配線よけの帯 (字の全幅) と描いた字が食い違う。
  const text = spot === null ? fitToBoard(caption(part), center.x, theme.metrics.textSize, layout) : caption(part);
  const label = spot === null
    ? partLabel(center.x, labelYOf(part, center, layout, theme) + drop, text, theme)
    : captionAt(spot, text, theme);
  // 3 引数 rotate() を読まないレンダラがあるので translate と rotate に分ける。
  const body = element(
    'g',
    { transform: `translate(${num(center.x)} ${num(center.y)}) rotate(${num(angle)})` },
    drawBody(part, span),
  );

  return `${lead}${body}${label}`;
}

