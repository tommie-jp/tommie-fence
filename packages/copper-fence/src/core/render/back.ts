import { element, num, svgText } from 'fence-kit';
import { hasBackGround } from '../model/board.ts';
import type { BackLayout, Layout } from '../model/layout.ts';
import type { Island } from '../geometry/islands.ts';
import { SMA } from '../parts/footprint.ts';
import type { Footprint } from '../parts/footprint.ts';
import type { Board, Mm, Rect, RectMm, ViaSpec } from '../types.ts';
import { smaEdge } from './parts.ts';
import type { Theme } from './theme.ts';

/**
 * **裏から見た図** (板を縦の軸でひっくり返して見た姿。左右が入れ替わる)。
 * copper の板は裏の地がネットの半分を決めるので、表だけでは治具にならない:
 *
 * - 裏に地のある板は**銅のベタ**、無い板は基材のまま
 * - 切り欠き (`slot`) は裏の地に開いた溝、via は裏まで抜けた穴
 * - 端面 SMA は裏にも腕が付く (板の縁を挟んでいる)。中心導体は表なので描かない
 * - 表の銅は**透かし**で薄く出す — 裏で切る・穴を開ける位置を表と合わせるため
 */
const rect = (box: Rect, attrs: Record<string, string | number>): string =>
  element('rect', { x: num(box.x), y: num(box.y), width: num(box.width), height: num(box.height), ...attrs });

function mmRect(back: BackLayout, box: RectMm): Rect {
  // 左右を裏返すので、左上は元の右上。
  const at = back.toPx({ x: box.x + box.width, y: box.y });
  const far = back.toPx({ x: box.x, y: box.y + box.height });
  return { x: at.x, y: at.y, width: far.x - at.x, height: far.y - at.y };
}

/** 裏の目盛。**数字も裏返った並び** (右が 0)。SMA の胴に隠れる所は描かない。 */
function rulers(board: Board, back: BackLayout, theme: Theme, hidden: { top: readonly (readonly [number, number])[]; left: readonly (readonly [number, number])[] }): string {
  const { palette, metrics } = theme;
  const size = metrics.lineTextSize;
  const covered = (ranges: readonly (readonly [number, number])[], mm: number): boolean =>
    ranges.some(([from, to]) => mm >= from && mm <= to);
  const out: string[] = [];
  const { y: top, x: left } = back.board;
  for (let mm = 0; mm <= board.width; mm += 1) {
    if (covered(hidden.top, mm)) continue;
    const x = back.toPx({ x: mm, y: 0 }).x;
    const long = mm % 5 === 0 ? 4 : 2;
    out.push(element('line', { x1: num(x), y1: num(top - long), x2: num(x), y2: num(top) }));
    if (mm % 10 === 0) out.push(svgText(x, top - 6, String(mm), { fill: palette.label, 'font-size': num(size), stroke: 'none' }));
  }
  for (let mm = 0; mm <= board.height; mm += 1) {
    if (covered(hidden.left, mm)) continue;
    const y = back.toPx({ x: 0, y: mm }).y;
    const long = mm % 5 === 0 ? 4 : 2;
    out.push(element('line', { x1: num(left - long), y1: num(y), x2: num(left), y2: num(y) }));
    if (mm % 10 === 0) {
      out.push(svgText(left - 6, y + size * 0.35, String(mm), { anchor: 'end', fill: palette.label, 'font-size': num(size), stroke: 'none' }));
    }
  }
  return element('g', { stroke: palette.label, 'stroke-width': 0.6 }, out.join(''));
}

export type BackInput = {
  readonly board: Board;
  readonly layout: Layout;
  readonly theme: Theme;
  readonly islands: readonly Island[];
  readonly slots: readonly { readonly rect: RectMm }[];
  readonly vias: readonly ViaSpec[];
  readonly footprints: readonly Footprint[];
};

export function renderBack(input: BackInput): string {
  const { board, layout, theme, islands, slots, vias, footprints } = input;
  const back = layout.back;
  if (back === null) return '';
  const { palette } = theme;
  const ground = hasBackGround(board);
  const label = svgText(back.board.x, back.labelBaseline, `裏から見た図 (左右反転) — ${ground ? '裏は銅のベタ (GND)' : '裏に銅は無い'}`, {
    anchor: 'start', fill: palette.caption, 'font-size': num(theme.metrics.textSize),
  });
  const plate = rect(back.board, { fill: ground ? palette.copper : palette.substrate, stroke: palette.substrateEdge, 'stroke-width': 1 });
  const cuts = ground ? slots.map((slot) => rect(mmRect(back, slot.rect), { fill: palette.groove })).join('') : '';
  // 表の銅の透かし。**まとめて薄くする** (重なった矩形の所だけ濃くならないように)。
  const ghost = element('g', { opacity: 0.28, fill: ground ? palette.groove : palette.copper },
    islands.flatMap((island) => island.pieces.map((piece) => rect(mmRect(back, piece.rect), {}))).join(''));
  const holes = vias.map((via) => {
    const at = back.toPx(via.at);
    const ring = element('circle', { cx: num(at.x), cy: num(at.y), r: num(layout.len((via.drill + 0.8) / 2)), fill: palette.solder });
    return ring + element('circle', { cx: num(at.x), cy: num(at.y), r: num(layout.len(via.drill / 2)), fill: palette.hole });
  }).join('');
  const smas = footprints.filter((one) => one.part.kind === 'edge').map((footprint) => {
    const at = back.toPx(footprint.center);
    const body = smaEdge(layout, footprint.part.variant === 'male-edge', palette.pin, false);
    const name = footprint.part.value === null ? footprint.part.id : `${footprint.part.id} ${footprint.part.value}`;
    const side = footprint.part.kind === 'edge' ? footprint.part.side : 'left';
    // 名札は胴の外。左右の SMA は胴の上、上下の SMA は胴の横 (表と同じ置き方を裏返す)。
    const reach = SMA.base + SMA.barrel;
    const labelAt: Mm = side === 'left' || side === 'right'
      ? { x: side === 'left' ? -reach / 2 : board.width + reach / 2, y: footprint.center.y - SMA.size / 2 }
      : { x: footprint.center.x + SMA.size / 2, y: side === 'top' ? -reach / 2 : board.height + reach / 2 };
    const where = back.toPx(labelAt);
    const text = svgText(where.x + (side === 'left' || side === 'right' ? 0 : -3), where.y - 3, name, {
      anchor: side === 'left' || side === 'right' ? 'middle' : 'end',
      fill: palette.caption, 'font-size': num(theme.metrics.textSize * 0.9), halo: palette.halo, haloWidth: 2.4,
    });
    return element('g', { transform: `translate(${num(at.x)} ${num(at.y)}) scale(-1 1) rotate(${num(footprint.angle)})` }, body) + text;
  }).join('');
  const hidden = (sides: readonly string[], along: (offset: number) => number): (readonly [number, number])[] => footprints
    .flatMap((one) => (one.part.kind === 'edge' && sides.includes(one.part.side)
      ? [[along(one.part.offset) - SMA.size / 2 - 1, along(one.part.offset) + SMA.size / 2 + 1] as const]
      : []));
  return label + plate + cuts + ghost + holes + smas
    + rulers(board, back, theme, { top: hidden(['top'], (offset) => offset), left: hidden(['right'], (offset) => offset) });
}
