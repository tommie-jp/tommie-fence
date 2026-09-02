import { element, num } from 'fence-kit';
import { createLayout } from '../model/layout.ts';
import { renderBoard } from './board.ts';
import { renderParts } from './parts.ts';
import { renderSlots } from './slots.ts';
import { renderTitle } from './title.ts';
import { renderWires } from './wires.ts';
import type { Layout } from '../model/layout.ts';
import type { Board, PlacedPart, RoutedWire } from '../types.ts';
import type { ResolvedLabels, Theme } from './theme.ts';

/**
 * 半田面 (裏返した板)。**表の図の下に、もう 1 枚**置く。
 *
 * ユニバーサル基板は配線を裏で半田付けするので、手を動かすときに見るのは
 * こちら側になる。表の図を裏から見るには左右が入れ替わるが、**頭の中で
 * 裏返すのは間違えやすい** — 1 番ピンの側を取り違えると、直すのに全部剥がす
 * ことになる。だから図のほうを裏返して出す。
 *
 * 描くのは**板・穴・縁の銅箔・配線・部品**だけ。部品は板の向こう側にあって実際には
 * 見えないが、**どのランドがどの部品の足か**が分からないと半田付けできない
 * ので、透かした形で置く。板の外の機器と注釈は表の図の話なので持ち込まない。
 *
 * **字は裏返さない。** 図ごと鏡にすると番地も題も読めなくなる。
 * 入れ替わるのは穴の並び (列) だけ (`createLayout` の `mirror`)。
 */

/** 見出し。表の図と取り違えると、部品の左右が入れ替わったまま組むことになる。 */
export const BACK_CAPTION = '半田面 (裏返した板)';

/** 半田面の板を置くための寸法。表と同じ形なので、大きさも同じ。 */
export const backSideLayout = (board: Board): Layout => createLayout(board, { mirror: true, title: true });

export function renderBackSide(
  board: Board,
  layout: Layout,
  content: { readonly wires: readonly RoutedWire[]; readonly parts: readonly PlacedPart[] },
  theme: Theme,
  labels: ResolvedLabels,
  top: number,
): string {
  const body = renderTitle(BACK_CAPTION, layout, theme)
    + renderBoard(board, layout, theme, labels)
    // 縁の銅箔は板そのものの持ち物なので、**裏返しても同じ場所にある**。
    + renderSlots(board, layout, theme)
    + renderWires(content.wires, layout, theme)
    + renderParts(content.parts, layout, theme);

  return element('g', { transform: `translate(0 ${num(top)})` }, body);
}
