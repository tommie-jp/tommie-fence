import { BOLD_FAMILY, element, num, svgText, textWidth } from 'fence-kit';
import type { Axis } from '../layout/axis.ts';
import type { Rect } from '../layout/page.ts';
import type { Point } from '../model/lines.ts';
import { xAt, yAt } from './axes.ts';
import type { Theme } from './theme.ts';

/**
 * 枠の中身。重ねる順は **band → 理想 (実線) → 実測 (○) → level → mark → peak → text**
 * (指した印が線の下に隠れないように。vna と同じ)。
 *
 * **枠の外の点は縁に寄せず、線を切る** — 縁を這う線は、無い値を在るように見せる。
 */

const STROKE = 1.5;
const DOT_RADIUS = 3;

const inside = (axis: Axis, value: number): boolean =>
  Number.isFinite(value) && value >= axis.min - (axis.max - axis.min) * 1e-9 && value <= axis.max + (axis.max - axis.min) * 1e-9
  && (!axis.log || value > 0);

/** 枠の内の点だけを、続いている所ごとの列に分ける。 */
function segments(points: readonly Point[], xAxis: Axis, yAxis: Axis): readonly (readonly Point[])[] {
  const out: Point[][] = [];
  let current: Point[] = [];
  for (const point of points) {
    if (inside(xAxis, point.x) && inside(yAxis, point.y)) {
      current.push(point);
      continue;
    }
    if (current.length > 0) out.push(current);
    current = [];
  }
  if (current.length > 0) out.push(current);
  return out;
}

/** 理想の線 (式・点列)。**実線** — 実測は ○ なので線種で分けなくてよい (52 の docs/92 の決め 7)。 */
export function renderIdeal(points: readonly Point[], xAxis: Axis, yAxis: Axis, rect: Rect, color: string): string {
  return segments(points, xAxis, yAxis).map((run) => (run.length < 2
    ? element('circle', { cx: num(xAt(xAxis, rect, run[0]?.x ?? 0)), cy: num(yAt(yAxis, rect, run[0]?.y ?? 0)), r: 1.5, fill: color })
    : element('polyline', {
      points: run.map((point) => `${num(xAt(xAxis, rect, point.x))},${num(yAt(yAxis, rect, point.y))}`).join(' '),
      fill: 'none', stroke: color, 'stroke-width': STROKE, 'stroke-linejoin': 'round',
    }))).join('');
}

/** 実測。**○ で打ち、線で結ばない** (52 の docs/98 §5.1)。 */
export function renderMeasured(points: readonly Point[], xAxis: Axis, yAxis: Axis, rect: Rect, color: string): string {
  return points.filter((point) => inside(xAxis, point.x) && inside(yAxis, point.y)).map((point) => element('circle', {
    cx: num(xAt(xAxis, rect, point.x)), cy: num(yAt(yAxis, rect, point.y)), r: DOT_RADIUS, fill: 'none', stroke: color, 'stroke-width': 1.3,
  })).join('');
}

const noteText = (x: number, y: number, text: string, theme: Theme, anchor: 'start' | 'middle' | 'end', fill = theme.palette.note): string =>
  svgText(x, y, text, {
    anchor, fill, 'font-size': num(theme.metrics.smallSize), 'font-weight': 600, 'font-family': BOLD_FAMILY,
    halo: theme.palette.halo, haloWidth: 2.5,
  });

/** x の帯。字は一番下の枠にだけ。 */
export function renderBand(from: number, to: number, text: string | null, xAxis: Axis, rect: Rect, theme: Theme, labelled: boolean): string {
  const left = xAt(xAxis, rect, Math.max(from, xAxis.min));
  const right = xAt(xAxis, rect, Math.min(to, xAxis.max));
  if (right <= left) return '';
  const fill = element('rect', {
    x: num(left), y: num(rect.y), width: num(right - left), height: num(rect.height), fill: theme.palette.band, 'fill-opacity': 0.35,
  });
  // 字は帯の下端 (上端は mark の字と水準の字が来る)。
  return fill + (labelled && text !== null ? noteText((left + right) / 2, rect.y + rect.height - 5, text, theme, 'middle') : '');
}

/** 横の水準 (−3 dB・0.707)。字は右端の上。 */
export function renderLevel(value: number, text: string, yAxis: Axis, rect: Rect, theme: Theme): string {
  if (!inside(yAxis, value)) return '';
  const y = yAt(yAxis, rect, value);
  // 字は線の上。枠の上端に近ければ線の下 (枠の外へはみ出さない)。
  const size = theme.metrics.smallSize;
  const above = y - rect.y > size + 4;
  return element('line', {
    x1: num(rect.x), y1: num(y), x2: num(rect.x + rect.width), y2: num(y), stroke: theme.palette.note, 'stroke-width': 1, 'stroke-dasharray': '3 3',
  }) + noteText(rect.x + rect.width - 3, above ? y - 3 : y + size + 2, text, theme, 'end');
}

/** x の印 (縦の破線)。字は {@link renderMarkLabels} が枠の上に置く。 */
export function renderMark(x: number, xAxis: Axis, rect: Rect, theme: Theme): string {
  if (!inside(xAxis, x)) return '';
  const at = xAt(xAxis, rect, x);
  return element('line', {
    x1: num(at), y1: num(rect.y), x2: num(at), y2: num(rect.y + rect.height), stroke: theme.palette.note, 'stroke-width': 1, 'stroke-dasharray': '3 3',
  });
}

/**
 * mark の字 (x の値) を一番上の枠の上の行に。**重なる字は省く** — 値は読み値の表に
 * 必ずあるので、字を詰めて読めなくするより省くほうがよい。`reserved` は縦軸の名札が
 * 占める幅 (左から)。
 */
export function renderMarkLabels(
  marks: readonly { readonly x: number; readonly text: string }[], xAxis: Axis, rect: Rect, baseline: number, reserved: number, theme: Theme,
): string {
  const size = theme.metrics.smallSize;
  const taken: (readonly [number, number])[] = [[-Infinity, reserved]];
  const out: string[] = [];
  for (const mark of marks) {
    if (!inside(xAxis, mark.x)) continue;
    const width = textWidth(mark.text) * size;
    const center = Math.min(Math.max(xAt(xAxis, rect, mark.x), rect.x + width / 2), rect.x + rect.width - width / 2);
    const span = [center - width / 2 - 3, center + width / 2 + 3] as const;
    if (taken.some(([from, to]) => span[0] < to && span[1] > from)) continue;
    taken.push(span);
    out.push(noteText(center, baseline, mark.text, theme, 'middle'));
  }
  return out.join('');
}

/** 頂点の印 (▽ と値)。**枠の上端に近ければ印を点の下に返す** (字が枠の外へ出ない)。 */
export function renderPeak(point: Point, text: string, xAxis: Axis, yAxis: Axis, rect: Rect, color: string, theme: Theme): string {
  if (!inside(xAxis, point.x) || !inside(yAxis, point.y)) return '';
  const x = xAt(xAxis, rect, point.x);
  const y = yAt(yAxis, rect, point.y);
  const below = y - rect.y < theme.metrics.smallSize + 14;
  const tip = below ? 2 : -2;
  const base = below ? 9 : -9;
  const path = `M${num(x)},${num(y + tip)} L${num(x - 4)},${num(y + base)} L${num(x + 4)},${num(y + base)} Z`;
  const size = theme.metrics.smallSize;
  // 字は左右の縁に寄せすぎない (枠の外へはみ出さない)。
  const half = (textWidth(text) * size) / 2;
  const at = Math.min(Math.max(x, rect.x + half + 2), rect.x + rect.width - half - 2);
  return element('path', { d: path, fill: color }) + noteText(at, below ? y + base + size + 2 : y + base - 3, text, theme, 'middle', color);
}

/** 点に字。 */
export function renderNoteText(x: number, y: number, text: string, xAxis: Axis, yAxis: Axis, rect: Rect, theme: Theme): string {
  if (!inside(xAxis, x) || !inside(yAxis, y)) return '';
  return noteText(xAt(xAxis, rect, x), yAt(yAxis, rect, y), text, theme, 'middle');
}
