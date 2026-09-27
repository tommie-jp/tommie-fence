import { element, num, svgText, textWidth } from 'fence-kit';
import { DIVISIONS, STATUS_LEADING } from '../layout/screen.ts';
import type { Layout } from '../layout/screen.ts';
import type { Theme } from './theme.ts';

/**
 * 画面の格子。**10 × 10 目盛、線は点線、枠は実線** — tinySA の画面と同じ。
 * **空でも描く** (52 の docs/54: 読めた所まで描く)。格子と状態の行は scope の写し。
 */
export function renderGrid(layout: Layout, theme: Theme): string {
  const { x, y, width, height } = layout.grid;
  const dx = width / DIVISIONS.x;
  const dy = height / DIVISIONS.y;
  const lines: string[] = [];
  const line = (x1: number, y1: number, x2: number, y2: number): void => {
    lines.push(element('line', {
      x1: num(x1), y1: num(y1), x2: num(x2), y2: num(y2), stroke: theme.palette.grid, 'stroke-width': 1, 'stroke-dasharray': '1 3',
    }));
  };
  for (let index = 1; index < DIVISIONS.x; index += 1) line(x + index * dx, y, x + index * dx, y + height);
  for (let index = 1; index < DIVISIONS.y; index += 1) line(x, y + index * dy, x + width, y + index * dy);
  const frame = element('rect', {
    x: num(x), y: num(y), width: num(width), height: num(height), fill: 'none', stroke: theme.palette.frame, 'stroke-width': 1,
  });
  return lines.join('') + frame;
}

/** 縦軸の字 (目盛ごと、上から)。`labels` は 11 個 (上端〜下端)。空なら描かない。 */
export function renderLevelLabels(labels: readonly string[], layout: Layout, theme: Theme): string {
  const { x, y, height } = layout.grid;
  const size = theme.metrics.smallSize;
  return labels.map((label, index) => svgText(x - 4, y + (index * height) / DIVISIONS.y + size * 0.35, label, {
    anchor: 'end', fill: theme.palette.label, 'font-size': num(size),
  })).join('');
}

/** 横軸の字 (左端・中央・右端)。 */
export function renderFrequencyLabels(labels: readonly [string, string, string] | null, layout: Layout, theme: Theme): string {
  if (labels === null) return '';
  const { x, width } = layout.grid;
  const size = theme.metrics.smallSize;
  const at = (px: number, text: string, anchor: 'start' | 'middle' | 'end'): string =>
    svgText(px, layout.axisBaseline, text, { anchor, fill: theme.palette.label, 'font-size': num(size) });
  return at(x, labels[0], 'start') + at(x + width / 2, labels[1], 'middle') + at(x + width, labels[2], 'end');
}

/** 状態の行の 1 項目 (`RBW 300 kHz` など)。 */
export type StatusItem = { readonly text: string; readonly fill: string };

const STATUS_GAP = 12;

/** 状態の行が要る幅 (px)。 */
export const statusWidth = (items: readonly StatusItem[], theme: Theme): number =>
  items.reduce((sum, item) => sum + textWidth(item.text) * theme.metrics.smallSize, 0) + STATUS_GAP * Math.max(0, items.length - 1);

/**
 * 状態の行を格子の幅に収める。**収まらなければ `split` 個目で 2 行に分ける**
 * (1 行目は機種と掃引、2 行目は受信機と表示)。
 */
export function statusLines(items: readonly StatusItem[], split: number, room: number, theme: Theme): readonly (readonly StatusItem[])[] {
  if (statusWidth(items, theme) <= room) return [items];
  return [items.slice(0, split), items.slice(split)];
}

/** 格子の下の状態の行。**左から詰めて置く** (幅は字の見積もり)。 */
export function renderStatus(lines: readonly (readonly StatusItem[])[], layout: Layout, theme: Theme): string {
  const size = theme.metrics.smallSize;
  return lines.map((items, row) => {
    let x = layout.grid.x;
    return items.map((item) => {
      const text = svgText(x, layout.statusBaseline + row * STATUS_LEADING, item.text, { anchor: 'start', fill: item.fill, 'font-size': num(size) });
      x += textWidth(item.text) * size + STATUS_GAP;
      return text;
    }).join('');
  }).join('');
}
