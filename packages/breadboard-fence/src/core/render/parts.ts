import type { Layout } from '../model/layout.ts';
import type { PlacedPart, Point, Rect } from '../types.ts';
import { boardBodyRect, renderBoardPart } from './boardPart.ts';
import { renderDip, renderPushbutton, renderSip, sipBarRect, switchBodyRect } from './packages.ts';
import {
  CAPTION_DROP, CAPTION_HEIGHT, LEG_NAME_GAP, ROUND_CAPTION_GAP, caption, charWidth, labelYOf,
} from './partCommon.ts';
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
    // 胴・キャプション・足の名前を**別々の矩形で渡す**。いちばん広いものに合わせて
    // 1 つの箱にすると、何も描いていないところまで塞いで、
    // 空いているレーンを配線に諦めさせてしまう。
    const toRavine = center.y < layout.ravineY ? 1 : -1;

    return [
      {
        x: center.x - halfWidth,
        y: center.y - halfHeight - reach,
        width: halfWidth * 2,
        height: halfHeight * 2 + reach * 2,
      },
      // キャプションは胴の外、溝の側 (threeLead.ts と同じ勘定)。
      captionBand(center.x, center.y + toRavine * (halfHeight + ROUND_CAPTION_GAP), captionWidth(part, theme), theme),
      // 足の名前は反対側に並ぶ。名前が長ければ胴からはみ出す。
      ...legNameBands(part, points, center, halfHeight, toRavine, theme),
    ];
  }

  const center = { x: (left + right) / 2, y: (top + bottom) / 2 };
  const width = Math.max(captionWidth(part, theme), right - left);

  return [captionBand(center.x, labelYOf(part, center, layout), width, theme)];
}

/** 字 1 行が占める帯。`baseline` は字の基準線で、字はそこから上へ伸びる。 */
function captionBand(centerX: number, baseline: number, width: number, theme: RenderTheme): Rect {
  const height = textScale(theme) * CAPTION_HEIGHT;
  return { x: centerX - width / 2, y: baseline - height + 3, width, height };
}

/**
 * 3 本足の足の名前が占める帯。**レーンにいちばん近い字**なので、
 * ここを見落とすと配線が名前の上を走る (`B` のような 1 字なら胴に隠れるが、
 * 長い名前を付けると横にはみ出す)。
 */
function legNameBands(
  part: PlacedPart,
  points: readonly Point[],
  center: Point,
  halfHeight: number,
  toRavine: number,
  theme: RenderTheme,
): Rect[] {
  const baseline = center.y - toRavine * (halfHeight + LEG_NAME_GAP);
  return part.pins.flatMap((pin, index) => {
    const point = points[index];
    if (!point) return [];
    return [captionBand(point.x, baseline, [...pin.name].length * charWidth(theme), theme)];
  });
}

/**
 * 字が図の上で占める横幅。**コードポイントで数え、ラテン文字より広いものは 2 文字ぶん**。
 * サロゲートペアを 2 と数えると絵文字だけ広がり、1 と数えると漢字も絵文字も狭くなる。
 * 狭く見るほうが危ない側で、塞ぎ損ねた字の上を配線が走る。
 */
const captionWidth = (part: PlacedPart, theme: RenderTheme): number =>
  [...caption(part)].reduce((sum, char) => sum + ((char.codePointAt(0) ?? 0) > 0xff ? 2 : 1), 0)
  * charWidth(theme);

export function renderPart(part: PlacedPart, layout: Layout, theme: RenderTheme): string {
  if (part.kind === 'dip') return renderDip(part, layout, theme);
  if (part.kind === 'sip') return renderSip(part, layout, theme);
  if (part.kind === 'switch') return renderPushbutton(part, layout, theme);
  if (part.kind === 'board') return renderBoardPart(part, layout, theme);
  if (part.kind === 'three-lead') return renderThreeLead(part, layout, theme);
  // 機器 (device) は帯の中に別の描き方で置くので、ここには来ない。
  return renderTwoLead(part, layout, theme);
}
