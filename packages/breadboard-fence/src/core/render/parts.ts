import type { Layout } from '../model/layout.ts';
import type { PlacedPart, Point, Rect } from '../types.ts';
import { boardBodyRect, renderBoardPart } from './boardPart.ts';
import { connectorBodyRect, renderConnector } from './connector.ts';
import {
  fourLeadBodyRect, renderDip, renderPushbutton, renderSip, renderTransformer, sipBarRect, switchBodyRect,
} from './packages.ts';
import { CAPTION_DROP, charWidth } from './partCommon.ts';
import { band, captionBandOf, captionDropOf } from './captions.ts';
import { bodyDown, bodyHalfWidth, bodyUp, legNames, renderThreeLead } from './threeLead.ts';
import { renderTwoLead } from './twoLead.ts';
import type { RenderTheme } from './theme.ts';
import { textScale } from './theme.ts';

/**
 * 配線に横切られたくない領域。2 ピンの部品では本体そのものより、
 * 溝側に置いたラベルがレーンと同じ高さに来るのが問題になる。
 * 大きな部品 (パッケージ・ボード) は本体の外形をそのまま渡す。
 */
export function partObstacles(
  part: PlacedPart,
  layout: Layout,
  theme: RenderTheme,
  drops?: ReadonlyMap<string, number>,
): Rect[] {
  // **名札の帯は `captions.ts` が持つ** — 描く位置と同じ勘定を使う
  // (別々に持つと、逃がした名札の上を配線が走る)。
  const drop = drops?.get(part.id) ?? 0;
  const label = captionBandOf(part, layout, theme, drop);
  const bands = label === null ? [] : [label];

  if (part.kind === 'board') return [boardBodyRect(part, layout), ...bands];
  if (part.kind === 'sip') return [sipBarRect(part, layout)];
  if (part.kind === 'switch') return [switchBodyRect(part, layout), ...bands];
  if (part.kind === 'four-lead') return [fourLeadBodyRect(part, layout), ...bands];
  if (part.kind === 'connector') return [connectorBodyRect(part, layout), ...bands];

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
    // 胴の上下の伸び。TO-220 は上へだけ (ピンが下)。上へ出す字は無いので帯も足さない。
    const up = bodyUp(part, layout);
    const down = bodyDown(part, layout);
    const upOnly = down < up;
    // 胴は姿によって縦より横に広い (TO-220・半固定抵抗・スライドスイッチ)。
    // 丸の半径で作っていたころは、その差のぶんだけ配線が本体の上を通っていた。
    const halfWidth = bodyHalfWidth(part, layout);
    const center = points[1] ?? points[0]!;
    // 本体に、上下へ出したピン名とラベルを足した高さ。字が伸びればここも伸びる。
    const reach = CAPTION_DROP * textScale(theme);
    // 胴・キャプション・ピンの名前を**別々の矩形で渡す**。いちばん広いものに合わせて
    // 1 つの箱にすると、何も描いていないところまで塞いで、
    // 空いているレーンを配線に諦めさせてしまう。
    return [
      {
        x: center.x - halfWidth,
        y: center.y - up - (upOnly ? 0 : reach),
        width: halfWidth * 2,
        height: up + down + (upOnly ? 0 : reach) + reach,
      },
      ...bands,
      // ピンの名前は胴の外に並ぶ。名前が長ければ胴からはみ出す。
      ...legNameBands(part, layout, theme),
    ];
  }

  return bands;
}

/**
 * 3 ピンのピンの名前が占める帯。**レーンにいちばん近い字**なので、
 * ここを見落とすと配線が名前の上を走る (`B` のような 1 字なら胴に隠れるが、
 * 長い名前を付けると横にはみ出す)。置き場は描く側と同じ `legNames`。
 */
function legNameBands(part: PlacedPart, layout: Layout, theme: RenderTheme): Rect[] {
  return legNames(part, layout, theme)
    .map((name) => band(name.x, name.y, [...name.name].length * charWidth(theme), theme));
}

export function renderPart(
  part: PlacedPart,
  layout: Layout,
  theme: RenderTheme,
  drops?: ReadonlyMap<string, number>,
): string {
  // **名札がぶつかったら 1 行下げる** (`captions.ts`)。逃がす量は配線よけと同じ。
  const drop = captionDropOf(drops, part, theme);
  if (part.kind === 'dip') return renderDip(part, layout, theme);
  if (part.kind === 'sip') return renderSip(part, layout, theme);
  if (part.kind === 'switch') return renderPushbutton(part, layout, theme, drop);
  if (part.kind === 'four-lead') return renderTransformer(part, layout, theme, drop);
  if (part.kind === 'connector') return renderConnector(part, layout, theme, drop);
  if (part.kind === 'board') return renderBoardPart(part, layout, theme, drop);
  // 3 ピンの名札は置き場の候補 (ピンの名前の横・1 行下) から選ぶので、段の番号をそのまま渡す。
  if (part.kind === 'three-lead') return renderThreeLead(part, layout, theme, drops?.get(part.id) ?? 0);
  // 機器 (device) は帯の中に別の描き方で置くので、ここには来ない。
  return renderTwoLead(part, layout, theme, drop);
}
