import { element, fit, num, svgText, textWidth } from 'fence-kit';
import type { Layout, Rect } from '../layout/screen.ts';
import { SIZE } from '../layout/screen.ts';
import { formatBusValue } from '../model/radix.ts';
import type { BitRow, BusRow, DecodeRow, Row } from '../model/rows.ts';
import { xOf } from '../model/window.ts';
import type { Window } from '../model/window.ts';
import type { Theme } from './theme.ts';

/**
 * 行の絵。**1 ビットは線 (H の区間は同じ色で塗る)、バスは値の箱、読み下しはフレームの箱**。
 * 変わり目が 3 px より近い行 (`dense`) は線でなく塗りで描く (`model/window.ts` の `PLOT.minGapPx`)。
 */
const STROKE = 1.6;
/** バスの箱の、変わり目の斜めの幅の上限 (px)。 */
const SLANT = 4;
/** 箱の中の字の左右の余白 (px)。 */
const PAD = 3;

type Frame = { readonly top: number; readonly bottom: number; readonly mid: number };

const frameOf = (plot: Rect, index: number, rowCount: number): Frame => {
  const pitch = plot.height / rowCount;
  const top = plot.y + index * pitch + SIZE.laneInset;
  const bottom = plot.y + (index + 1) * pitch - SIZE.laneInset;
  return { top, bottom, mid: (top + bottom) / 2 };
};

function bitRow(row: BitRow, window: Window, plot: Rect, frame: Frame, theme: Theme): string {
  const color = theme.palette.lane;
  const levelY = (level: number): number => (level === 1 ? frame.top : frame.bottom);
  if (row.dense || row.transitions === null) {
    return element('rect', { x: num(plot.x), y: num(frame.top), width: num(plot.width), height: num(frame.bottom - frame.top), fill: color, 'fill-opacity': 0.3 })
      + element('path', { d: `M${num(plot.x)} ${num(frame.top)}H${num(plot.x + plot.width)}M${num(plot.x)} ${num(frame.bottom)}H${num(plot.x + plot.width)}`, fill: 'none', stroke: color, 'stroke-width': STROKE });
  }
  let path = `M${num(plot.x)} ${num(levelY(row.initial))}`;
  for (const edge of row.transitions) {
    const x = plot.x + xOf(window, edge.t);
    path += `H${num(x)}V${num(levelY(edge.v))}`;
  }
  path += `H${num(plot.x + plot.width)}`;
  // H の区間は線と同じ色で薄く塗る (底の線まで閉じた形)
  const area = `${path}V${num(frame.bottom)}H${num(plot.x)}Z`;
  return element('path', { d: area, fill: color, 'fill-opacity': 0.3, stroke: 'none' })
    + element('path', { d: path, fill: 'none', stroke: color, 'stroke-width': STROKE, 'stroke-linejoin': 'miter' });
}

/** 箱の字。入りきらなければ書かない (切った字は別の値に読める)。 */
function boxText(text: string, x0: number, x1: number, y: number, theme: Theme, fill: string): string {
  const size = theme.metrics.smallSize;
  if (textWidth(text) * size > x1 - x0 - PAD * 2) return '';
  return svgText((x0 + x1) / 2, y + size * 0.35, text, { anchor: 'middle', fill, 'font-size': num(size), halo: theme.palette.halo, haloWidth: 3 });
}

function busRow(row: BusRow, window: Window, plot: Rect, frame: Frame, theme: Theme): string {
  const color = theme.palette.bus;
  const left = plot.x;
  const right = plot.x + plot.width;
  if (row.segments === null) {
    return element('rect', { x: num(left), y: num(frame.top), width: num(right - left), height: num(frame.bottom - frame.top), fill: color, 'fill-opacity': 0.3, stroke: color, 'stroke-width': STROKE });
  }
  const parts: string[] = [];
  row.segments.forEach((segment, index) => {
    const x0 = plot.x + xOf(window, segment.t0);
    const x1 = plot.x + xOf(window, segment.t1);
    const open0 = index === 0;
    const open1 = index === row.segments!.length - 1;
    const slant0 = open0 ? 0 : Math.min(SLANT, (x1 - x0) / 3);
    const slant1 = open1 ? 0 : Math.min(SLANT, (x1 - x0) / 3);
    let d = `M${num(x0 + slant0)} ${num(frame.top)}H${num(x1 - slant1)}`;
    d += open1 ? '' : `L${num(x1)} ${num(frame.mid)}L${num(x1 - slant1)} ${num(frame.bottom)}`;
    d += open1 ? `M${num(x1)} ${num(frame.bottom)}` : '';
    d += `H${num(x0 + slant0)}`;
    d += open0 ? '' : `L${num(x0)} ${num(frame.mid)}L${num(x0 + slant0)} ${num(frame.top)}`;
    parts.push(element('path', { d, fill: 'none', stroke: color, 'stroke-width': STROKE, 'stroke-linejoin': 'round' }));
    parts.push(boxText(formatBusValue(segment.value, row.width, row.radix), x0 + slant0, x1 - slant1, frame.mid, theme, theme.palette.caption));
  });
  return parts.join('');
}

function decodeRow(row: DecodeRow, window: Window, plot: Rect, frame: Frame, theme: Theme): string {
  // アイドルの点線はフレームの間だけ (箱の中を横切ると字が読みにくい)。
  const idle = (from: number, to: number): string => (to - from < 1 ? '' : element('line', {
    x1: num(from), y1: num(frame.mid), x2: num(to), y2: num(frame.mid), stroke: theme.palette.decode, 'stroke-width': 1, 'stroke-dasharray': '2 3',
  }));
  const parts: string[] = [];
  let free = plot.x;
  for (const item of row.frames) {
    parts.push(idle(free, plot.x + xOf(window, item.t0)));
    free = plot.x + xOf(window, item.t1);
    const x0 = plot.x + xOf(window, item.t0);
    const x1 = plot.x + xOf(window, item.t1);
    const color = item.error === null ? theme.palette.decode : theme.palette.trigger;
    parts.push(element('rect', {
      x: num(x0), y: num(frame.top), width: num(Math.max(x1 - x0, 1)), height: num(frame.bottom - frame.top), rx: 3, fill: color, 'fill-opacity': 0.14, stroke: color, 'stroke-width': STROKE,
    }));
    parts.push(boxText(item.text, x0, x1, frame.mid, theme, theme.palette.caption));
  }
  parts.push(idle(free, plot.x + plot.width));
  return parts.join('');
}

/** 行の名前 (格子の左、右寄せ)。バスと読み下しは色で種類を分ける。 */
function labelOf(row: Row, layout: Layout, frame: Frame, theme: Theme): string {
  const color = row.kind === 'bit' ? theme.palette.lane : row.kind === 'bus' ? theme.palette.bus : theme.palette.decode;
  const size = theme.metrics.textSize;
  const room = layout.plot.x - 14 - SIZE.labelGap / 2;
  return svgText(layout.plot.x - SIZE.labelGap / 2, frame.mid + size * 0.35, fit(row.name, room / size), {
    anchor: 'end', fill: color, 'font-size': num(size), 'font-weight': 600,
  });
}

export function renderRows(rows: readonly Row[], window: Window, layout: Layout, theme: Theme): string {
  return rows.map((row, index) => {
    const frame = frameOf(layout.plot, index, layout.rowCount);
    const body = row.kind === 'bit' ? bitRow(row, window, layout.plot, frame, theme)
      : row.kind === 'bus' ? busRow(row, window, layout.plot, frame, theme)
        : decodeRow(row, window, layout.plot, frame, theme);
    return labelOf(row, layout, frame, theme) + body;
  }).join('');
}
