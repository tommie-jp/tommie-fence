import { element, num, svgText, textWidth } from 'fence-kit';
import type { Layout } from '../layout/screen.ts';
import { DIVISIONS } from '../model/screen.ts';
import type { Theme } from './theme.ts';

/**
 * 画面の格子。**10 × 8 目盛、中央の縦横の線に細目盛 (1 目盛を 5 つに)** — 実機の
 * 画面と同じ。**空でも描く** (52 の docs/54: 読めた所まで描く)。
 */
const MINOR = 5;
const MINOR_LENGTH = 3;

export function renderGrid(layout: Layout, theme: Theme): string {
  const { x, y, width, height } = layout.grid;
  const dx = width / DIVISIONS.x;
  const dy = height / DIVISIONS.y;
  const lines: string[] = [];
  const line = (x1: number, y1: number, x2: number, y2: number, stroke: string, extra: Record<string, string | number> = {}): void => {
    lines.push(element('line', { x1: num(x1), y1: num(y1), x2: num(x2), y2: num(y2), stroke, 'stroke-width': 1, ...extra }));
  };
  for (let index = 1; index < DIVISIONS.x; index += 1) {
    line(x + index * dx, y, x + index * dx, y + height, theme.palette.grid, index === DIVISIONS.x / 2 ? {} : { 'stroke-dasharray': '1 3' });
  }
  for (let index = 1; index < DIVISIONS.y; index += 1) {
    line(x, y + index * dy, x + width, y + index * dy, theme.palette.grid, index === DIVISIONS.y / 2 ? {} : { 'stroke-dasharray': '1 3' });
  }
  const cx = x + width / 2;
  const cy = y + height / 2;
  for (let index = 1; index < DIVISIONS.x * MINOR; index += 1) {
    if (index % MINOR === 0) continue;
    const tx = x + (index * dx) / MINOR;
    line(tx, cy - MINOR_LENGTH, tx, cy + MINOR_LENGTH, theme.palette.grid);
  }
  for (let index = 1; index < DIVISIONS.y * MINOR; index += 1) {
    if (index % MINOR === 0) continue;
    const ty = y + (index * dy) / MINOR;
    line(cx - MINOR_LENGTH, ty, cx + MINOR_LENGTH, ty, theme.palette.grid);
  }
  const frame = element('rect', {
    x: num(x), y: num(y), width: num(width), height: num(height), fill: 'none', stroke: theme.palette.frame, 'stroke-width': 1,
  });
  return lines.join('') + frame;
}

/** 状態の行の 1 項目 (`CH1 500mV/div` など)。色は ch の色。 */
export type StatusItem = { readonly text: string; readonly fill: string };

const STATUS_GAP = 14;

/**
 * 格子の下の状態の行: `CH1 500mV/div  CH2 500mV/div  1ms/div  Trig CH1 ↑ 1.00 V`。
 * **左から詰めて置く** (幅は字の見積もり)。
 */
export function renderStatus(items: readonly StatusItem[], layout: Layout, theme: Theme): string {
  const size = theme.metrics.smallSize;
  let x = layout.grid.x;
  return items.map((item) => {
    const text = svgText(x, layout.statusBaseline, item.text, { anchor: 'start', fill: item.fill, 'font-size': num(size) });
    x += textWidth(item.text) * size + STATUS_GAP;
    return text;
  }).join('');
}

/** 状態の行が要る幅 (px)。格子の幅に収まるかを試験で見る。 */
export const statusWidth = (items: readonly StatusItem[], theme: Theme): number =>
  items.reduce((sum, item) => sum + textWidth(item.text) * theme.metrics.smallSize, 0) + STATUS_GAP * Math.max(0, items.length - 1);
