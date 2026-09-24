import { element, num } from 'fence-kit';
import type { Layout } from '../model/layout.ts';
import { formatPoint } from '../model/point.ts';
import { centred } from '../geometry/shapes.ts';
import { VIA_RING } from '../geometry/shapes.ts';
import type { Board, CopperSpec, LineSpec, Mm, RectMm } from '../types.ts';

/**
 * マップのエディタで**掴むための印**。図の見た目は変えない (どれも透明)。
 * 殻 (fence-kit の webview) が読む約束は 3 つのフェンスと同じ:
 *
 * - `.cf-cell[data-address]` — 置き先の升。**1mm ごと** (端数は殻が `step` に渡す)
 * - `.cf-dot[data-node]` — 動かせる点 (線路の折れ目・端、ジャンパと足のある部品の端)
 * - `.cf-chip[data-part]` — 部品。島 (`pad` `via` `slot`) も部品として掴む
 * - `.cf-wire-hit[data-line]` と `.cf-wire-end` — 線路とジャンパ。端だけも掴める
 */

/** 升の当たり (1mm に対する比)。perfboard と同じ 0.9。 */
const CELL = 0.9;
/** 節点の輪の半径 (mm)。 */
const DOT = 0.5;

const rect = (layout: Layout, box: RectMm, attrs: Record<string, string>): string => {
  const at = layout.toPx({ x: box.x, y: box.y });
  return element('rect', {
    ...attrs, x: num(at.x), y: num(at.y), width: num(layout.len(box.width)), height: num(layout.len(box.height)), fill: 'transparent',
  });
};

/** 島・via・切り欠きを部品として掴む印。**部品より下に敷く** (チップが載った島ではチップが勝つ)。 */
export function renderShapeHits(copper: readonly CopperSpec[], layout: Layout): string {
  return copper.map((spec) => {
    if (spec.kind === 'line') return '';
    const size = spec.kind === 'via' ? spec.drill + VIA_RING : null;
    const box = size === null
      ? centred(spec.at, (spec as { width: number }).width, (spec as { height: number }).height)
      : centred(spec.at, size, size);
    return rect(layout, box, { class: 'cf-chip', 'data-part': spec.id });
  }).join('');
}

/** 線路を配線として掴む印。区間ごとの太い透明の線と、両端の輪。 */
export function renderLineHits(lines: readonly LineSpec[], layout: Layout): string {
  return lines.map((spec) => {
    const line = String(spec.line ?? 0);
    const width = Math.max(layout.len(spec.width), 8);
    const hits = spec.points.slice(1).map((point, index) => {
      const [a, b] = [layout.toPx(spec.points[index] ?? point), layout.toPx(point)];
      return element('line', {
        class: 'cf-wire-hit', 'data-line': line,
        x1: num(a.x), y1: num(a.y), x2: num(b.x), y2: num(b.y), stroke: 'transparent', 'stroke-width': num(width),
      });
    }).join('');
    const ends = ([['from', spec.points[0]], ['to', spec.points.at(-1)]] as const).map(([end, point]) => {
      if (point === undefined) return '';
      const at = layout.toPx(point);
      return element('circle', {
        class: 'cf-wire-end', 'data-line': line, 'data-end': end, cx: num(at.x), cy: num(at.y), r: 5, fill: 'transparent',
      });
    }).join('');
    return element('g', { class: 'cf-wire', 'data-line': line }, hits + ends);
  }).join('');
}

/** 升 (1mm ごと) と節点。**いちばん上に敷く** — 殻は重なりを全部読むので、上でも下の物は掴める。 */
export function renderHits(board: Board, layout: Layout, nodes: readonly Mm[]): string {
  const size = layout.len(CELL);
  const cells: string[] = [];
  for (let y = 0; y <= Math.floor(board.height); y += 1) {
    for (let x = 0; x <= Math.floor(board.width); x += 1) {
      const at = layout.toPx({ x, y });
      cells.push(element('rect', {
        class: 'cf-cell', 'data-address': formatPoint({ x, y }),
        x: num(at.x - size / 2), y: num(at.y - size / 2), width: num(size), height: num(size), fill: 'transparent',
      }));
    }
  }
  const seen = new Set<string>();
  const dots = nodes.filter((node) => {
    const written = formatPoint(node);
    if (seen.has(written)) return false;
    seen.add(written);
    return true;
  }).map((node) => {
    const at = layout.toPx(node);
    return element('circle', {
      class: 'cf-dot', 'data-node': formatPoint(node), cx: num(at.x), cy: num(at.y), r: num(layout.len(DOT)), fill: 'transparent',
    });
  });
  return element('g', { class: 'cf-hits' }, cells.join('')) + element('g', { class: 'cf-marks' }, dots.join(''));
}
