import { element, num, svgText } from 'fence-kit';
import { hasFrontGround } from '../model/board.ts';
import type { Layout } from '../model/layout.ts';
import type { Island } from '../geometry/islands.ts';
import { grow } from '../geometry/shapes.ts';
import type { Board, RectMm, Rect } from '../types.ts';
import type { Theme } from './theme.ts';

const rect = (box: Rect, attrs: Record<string, string | number>): string =>
  element('rect', { x: num(box.x), y: num(box.y), width: num(box.width), height: num(box.height), ...attrs });

/** mm の矩形を px に。 */
export const pxRect = (layout: Layout, box: RectMm): Rect => {
  const at = layout.toPx({ x: box.x, y: box.y });
  return { x: at.x, y: at.y, width: layout.len(box.width), height: layout.len(box.height) };
};

/**
 * 板の地。**地の在りかで描き分ける** (52 の docs/73 決め 6):
 *
 * - 裏ベタ・地なし — 銅を剥がした基材の上に、残した銅 (島) を描く
 * - 表が地 — 銅の板に、島のまわりの溝 (基材の色) を描く
 *
 * 描き方を分けるのは作り方 (剥がす / 切る) が違うからで、図を見れば
 * どちらの板か分かる。切り欠き (`slot`) は表が地の板では溝、
 * 裏ベタの板では裏の物なので破線。
 */
export function renderPlate(
  board: Board,
  layout: Layout,
  theme: Theme,
  islands: readonly Island[],
  slots: readonly { readonly rect: RectMm }[],
): string {
  const { palette } = theme;
  const front = hasFrontGround(board);
  const base = rect(layout.board, {
    fill: front ? palette.copper : palette.substrate,
    stroke: palette.substrateEdge,
    'stroke-width': 1,
  });
  if (!front) {
    const back = slots.map((slot) => rect(pxRect(layout, slot.rect), {
      fill: 'none', stroke: palette.hidden, 'stroke-width': 1, 'stroke-dasharray': '3 2',
    })).join('');
    return base + back;
  }
  // 溝は島を溝の幅だけ広げた矩形。**島より先に敷く** (島の銅が上に載る)。
  const grooves = islands
    .flatMap((island) => island.pieces.map((piece) => rect(pxRect(layout, grow(piece.rect, piece.gap)), { fill: palette.groove })))
    .join('');
  const cutOut = slots.map((slot) => rect(pxRect(layout, slot.rect), { fill: palette.groove })).join('');
  return base + grooves + cutOut;
}

/** 1mm の方眼。5mm ごとに濃く。**銅の上にも敷く** — 図から寸法を読んで切るため。 */
export function renderGrid(board: Board, layout: Layout, theme: Theme): string {
  const lines: string[] = [];
  const { x, y, width, height } = layout.board;
  for (let mm = 1; mm < board.width; mm += 1) {
    const at = x + layout.len(mm);
    lines.push(element('line', {
      x1: num(at), y1: num(y), x2: num(at), y2: num(y + height), 'stroke-opacity': mm % 5 === 0 ? 0.28 : 0.12,
    }));
  }
  for (let mm = 1; mm < board.height; mm += 1) {
    const at = y + layout.len(mm);
    lines.push(element('line', {
      x1: num(x), y1: num(at), x2: num(x + width), y2: num(at), 'stroke-opacity': mm % 5 === 0 ? 0.28 : 0.12,
    }));
  }
  return element('g', { stroke: theme.palette.grid, 'stroke-width': 0.4 }, lines.join(''));
}

/**
 * 目盛 — 板の上 (x) と左 (y)。1mm の短い刻み、5mm の長い刻み、10mm ごとの数字。
 * **SMA の胴に隠れる所は描かない** (`hidden` は板の辺に沿って隠れる範囲、mm)。
 */
export function renderRulers(
  board: Board,
  layout: Layout,
  theme: Theme,
  hidden: { readonly top: readonly (readonly [number, number])[]; readonly left: readonly (readonly [number, number])[] },
): string {
  const { palette, metrics } = theme;
  const size = metrics.lineTextSize;
  const covered = (ranges: readonly (readonly [number, number])[], mm: number): boolean =>
    ranges.some(([from, to]) => mm >= from && mm <= to);
  const parts: string[] = [];
  const { x, y } = layout.board;
  for (let mm = 0; mm <= board.width; mm += 1) {
    if (covered(hidden.top, mm)) continue;
    const at = x + layout.len(mm);
    const long = mm % 5 === 0 ? 4 : 2;
    parts.push(element('line', { x1: num(at), y1: num(y - long), x2: num(at), y2: num(y) }));
    if (mm % 10 === 0) parts.push(svgText(at, y - 6, String(mm), { fill: palette.label, 'font-size': num(size), stroke: 'none' }));
  }
  for (let mm = 0; mm <= board.height; mm += 1) {
    if (covered(hidden.left, mm)) continue;
    const at = y + layout.len(mm);
    const long = mm % 5 === 0 ? 4 : 2;
    parts.push(element('line', { x1: num(x - long), y1: num(at), x2: num(x), y2: num(at) }));
    if (mm % 10 === 0) {
      parts.push(svgText(x - 6, at + size * 0.35, String(mm), {
        anchor: 'end', fill: palette.label, 'font-size': num(size), stroke: 'none',
      }));
    }
  }
  return element('g', { stroke: palette.label, 'stroke-width': 0.6 }, parts.join(''));
}

/** 島の銅。**縁を描かない** — 1 つの島の矩形は重なっているので、縁を描くと継ぎ目が出る。 */
export function renderIslands(islands: readonly Island[], layout: Layout, theme: Theme): string {
  return islands
    .map((island) => element(
      'g',
      { 'data-net': island.name, fill: theme.palette.copper },
      island.pieces.map((piece) => rect(pxRect(layout, piece.rect), {})).join(''),
    ))
    .join('');
}

/** via の穴。銅の輪は形 (島) として描いてあるので、ここは穴だけ。 */
export function renderVias(vias: readonly { readonly at: { x: number; y: number }; readonly drill: number }[], layout: Layout, theme: Theme): string {
  return vias.map((via) => {
    const at = layout.toPx(via.at);
    return element('circle', { cx: num(at.x), cy: num(at.y), r: num(layout.len(via.drill / 2)), fill: theme.palette.hole });
  }).join('');
}
