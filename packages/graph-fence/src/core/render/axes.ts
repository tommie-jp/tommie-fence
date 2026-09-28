import { BOLD_FAMILY, element, num, svgText, textWidth } from 'fence-kit';
import { fraction, tickLabel } from '../layout/axis.ts';
import type { Axis } from '../layout/axis.ts';
import type { Rect } from '../layout/page.ts';
import type { Theme } from './theme.ts';

/**
 * 枠・格子・目盛の字・軸の名札。**目盛の字は間引く** — 両端と主目盛を先に置き、
 * 副目盛は隣の字と重ならないときだけ (対数の軸で字が詰まって読めなくなるのを防ぐ。
 * readable-graph の点検表)。
 */

/** 目盛の字どうしの余白 (横は字の間、縦は行の間)。 */
const X_GAP = 8;
const Y_GAP = 4;

export const xAt = (axis: Axis, rect: Rect, value: number): number => rect.x + fraction(axis, value) * rect.width;
export const yAt = (axis: Axis, rect: Rect, value: number): number => rect.y + rect.height - fraction(axis, value) * rect.height;

/** 軸の名札 (量/単位の形。52 の docs/98 §5.1)。対数ならそう書く (readable-graph #4)。 */
export function axisLabel(name: string | null, unit: string, log: boolean): string {
  const shown = unit === 'deg' ? '°' : unit;
  const body = name === null ? shown : `${name}/${shown}`;
  return log ? `${body} (対数)` : body;
}

type Candidate = { readonly value: number; readonly text: string; readonly rank: number };

/** 字を置く目盛を選ぶ。**先に置いた字と `gap` 以上離れた物だけ**。 */
function pickLabels(axis: Axis, unit: string, length: number, size: number, vertical: boolean): readonly Candidate[] {
  const endpoints: Candidate[] = [axis.min, axis.max].map((value) => ({ value, text: tickLabel(value, axis, unit), rank: 0 }));
  const ticks: Candidate[] = axis.ticks.map((tick) => ({ value: tick.value, text: tickLabel(tick.value, axis, unit), rank: tick.major ? 1 : 2 }));
  const candidates = [...endpoints, ...ticks].filter((one) => one.text !== '').sort((a, b) => a.rank - b.rank);
  // 縦は字の高さ + 余白、横は字の幅の半分ずつ + 余白だけ離す。
  const reach = (one: Candidate): number => (vertical ? (size + Y_GAP) / 2 : (textWidth(one.text) * size + X_GAP) / 2);
  const placed: { readonly at: number; readonly reach: number; readonly one: Candidate }[] = [];
  for (const one of candidates) {
    const at = fraction(axis, one.value) * length;
    const here = reach(one);
    if (placed.some((other) => Math.abs(other.at - at) < other.reach + here)) continue;
    placed.push({ at, reach: here, one });
  }
  return placed.map((item) => item.one);
}

/** 枠 1 つの格子と枠線。**主目盛は濃く、副目盛は薄く**。 */
export function renderFrame(xAxis: Axis, yAxis: Axis, rect: Rect, theme: Theme): string {
  const { palette } = theme;
  const lines: string[] = [];
  const line = (x1: number, y1: number, x2: number, y2: number, major: boolean): void => {
    lines.push(element('line', {
      x1: num(x1), y1: num(y1), x2: num(x2), y2: num(y2), stroke: palette.grid, 'stroke-width': major ? 0.8 : 0.5,
      ...(major ? {} : { 'stroke-dasharray': '2 2' }),
    }));
  };
  for (const tick of xAxis.ticks) {
    const x = xAt(xAxis, rect, tick.value);
    line(x, rect.y, x, rect.y + rect.height, tick.major);
  }
  for (const tick of yAxis.ticks) {
    const y = yAt(yAxis, rect, tick.value);
    line(rect.x, y, rect.x + rect.width, y, tick.major);
  }
  const frame = element('rect', {
    x: num(rect.x), y: num(rect.y), width: num(rect.width), height: num(rect.height), fill: 'none', stroke: palette.frame, 'stroke-width': 1,
  });
  return lines.join('') + frame;
}

/** 縦の目盛の字 (枠の左)。 */
export function renderYTicks(yAxis: Axis, unit: string, rect: Rect, theme: Theme): string {
  const size = theme.metrics.smallSize;
  return pickLabels(yAxis, unit, rect.height, size, true).map((one) =>
    svgText(rect.x - 5, yAt(yAxis, rect, one.value) + size * 0.35, one.text, {
      anchor: 'end', fill: theme.palette.label, 'font-size': num(size),
    })).join('');
}

/** 横の目盛の字 (一番下の枠の下)。 */
export function renderXTicks(xAxis: Axis, unit: string, rect: Rect, baseline: number, theme: Theme): string {
  const size = theme.metrics.smallSize;
  return pickLabels(xAxis, unit, rect.width, size, false).map((one) =>
    svgText(xAt(xAxis, rect, one.value), baseline, one.text, {
      anchor: 'middle', fill: theme.palette.label, 'font-size': num(size),
    })).join('');
}

/** 名札 (縦軸は枠の左上、横軸は枠の下の中央)。 */
export function renderAxisName(text: string, x: number, y: number, anchor: 'start' | 'middle', theme: Theme): string {
  return svgText(x, y, text, {
    anchor, fill: theme.palette.caption, 'font-size': num(theme.metrics.textSize), 'font-weight': 600, 'font-family': BOLD_FAMILY,
  });
}
