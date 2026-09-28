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

export function renderGrid(layout: Layout, theme: Theme, divisions: { readonly x: number; readonly y: number } = DIVISIONS): string {
  const { x, y, width, height } = layout.grid;
  const dx = width / divisions.x;
  const dy = height / divisions.y;
  const lines: string[] = [];
  const line = (x1: number, y1: number, x2: number, y2: number, stroke: string, extra: Record<string, string | number> = {}): void => {
    lines.push(element('line', { x1: num(x1), y1: num(y1), x2: num(x2), y2: num(y2), stroke, 'stroke-width': 1, ...extra }));
  };
  for (let index = 1; index < divisions.x; index += 1) {
    line(x + index * dx, y, x + index * dx, y + height, theme.palette.grid, index === divisions.x / 2 ? {} : { 'stroke-dasharray': '1 3' });
  }
  for (let index = 1; index < divisions.y; index += 1) {
    line(x, y + index * dy, x + width, y + index * dy, theme.palette.grid, index === divisions.y / 2 ? {} : { 'stroke-dasharray': '1 3' });
  }
  const cx = x + width / 2;
  const cy = y + height / 2;
  for (let index = 1; index < divisions.x * MINOR; index += 1) {
    if (index % MINOR === 0) continue;
    const tx = x + (index * dx) / MINOR;
    line(tx, cy - MINOR_LENGTH, tx, cy + MINOR_LENGTH, theme.palette.grid);
  }
  for (let index = 1; index < divisions.y * MINOR; index += 1) {
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

const STATUS_GAP = 16;

/**
 * 格子の下の状態の行: `CH1 500mV/div  CH2 500mV/div  1ms/div  Trig CH1 ↑ 1.00 V`。
 * **左から詰めて置く** (幅は字の見積もり)。行は `statusLines` で分けて渡す
 * (格子の幅に収まらなければ 2 行。`statusLines`)。
 */
export function renderStatus(lines: readonly (readonly StatusItem[])[], layout: Layout, theme: Theme): string {
  const size = theme.metrics.smallSize;
  return lines.map((items, row) => {
    let x = layout.grid.x;
    return items.map((item) => {
      const text = svgText(x, layout.statusBaseline + row * statusLeading(theme), item.text, { anchor: 'start', fill: item.fill, 'font-size': num(size) });
      x += textWidth(item.text) * size + STATUS_GAP;
      return text;
    }).join('');
  }).join('');
}

/** 状態の行の行送り (px)。 */
export const statusLeading = (theme: Theme): number => Math.round(theme.metrics.smallSize * 1.5);

/**
 * 状態の行を格子の幅に収める。**収まらなければ ch の V/div を 1 行目、time/div と
 * トリガを 2 行目**に分ける (4 ch だと 1 行に入らない)。`channels` は先頭の ch の項目の数。
 */
export function statusLines(items: readonly StatusItem[], channels: number, room: number, theme: Theme): readonly (readonly StatusItem[])[] {
  if (statusWidth(items, theme) <= room) return [items];
  return [items.slice(0, channels), items.slice(channels)];
}

/** 状態の行が要る幅 (px)。格子の幅に収まるかを試験で見る。 */
export const statusWidth = (items: readonly StatusItem[], theme: Theme): number =>
  items.reduce((sum, item) => sum + textWidth(item.text) * theme.metrics.smallSize, 0) + STATUS_GAP * Math.max(0, items.length - 1);

export const MARK = 7;

/** 基準の印の番号 1 つ (ch の番号と色。Math は `M`)。 */
export type MarkLabel = { readonly number: number | string; readonly color: string };

/** 番号 1 字ぶんの幅 (字の大きさに対する倍率)。 */
export const DIGIT = 0.62;
/** 並べた印どうしの隙間 (px)。 */
const MARK_GAP = 2;
/** 基準がこれより近い (目盛) ch は同じ高さとみなし、印を横に並べる。 */
const SAME_HEIGHT = 0.25;

/** 印 1 つ (三角 + 番号) が横に取る幅 (px)。左の余白はこれ × 並ぶ数だけ要る。 */
export const markStep = (theme: Theme): number => MARK + 1 + theme.metrics.smallSize * DIGIT + MARK_GAP;

/**
 * 基準の高さ (`fraction`。0 = 下、1 = 上) が **0.25 目盛未満**しか離れていない ch を 1 組にする。
 * 組の高さは最初の ch の高さ。順は渡した順 (ch の番号順)。
 */
export function groupMarks(marks: readonly { readonly fraction: number; readonly label: MarkLabel }[]): readonly { readonly fraction: number; readonly labels: readonly MarkLabel[] }[] {
  const groups: { readonly fraction: number; readonly labels: MarkLabel[] }[] = [];
  for (const { fraction, label } of marks) {
    const group = groups.find((one) => Math.abs(one.fraction - fraction) * DIVISIONS.y < SAME_HEIGHT);
    if (group === undefined) groups.push({ fraction, labels: [label] });
    else group.labels.push(label);
  }
  return groups;
}

/**
 * ch の基準 (0 V) の印 `1▶`。**格子の左の余白**に置く。格子の外なら縁に寄せる。
 * `fraction` は 0 = 下、1 = 上。**同じ高さの ch は印ごと横にずらして並べる** (`2▶1▶`)。
 * 番号を 1 つの三角の左に詰めると `12▶` と 1 つの番号に読める。三角と番号は各 ch の色。
 * 並ぶ数だけ左の余白を広げるのは割り付け (`createLayout` の `markSlots`) の役目。
 */
export function renderChannelMark(labels: readonly MarkLabel[], fraction: number, layout: Layout, theme: Theme): string {
  const { x, y, height } = layout.grid;
  const my = y + (1 - fraction) * height;
  const size = theme.metrics.smallSize;
  return labels.map((label, index) => {
    const tip = x - 1 - index * markStep(theme);
    const triangle = element('polygon', {
      points: `${num(tip - MARK)},${num(my - MARK / 2)} ${num(tip)},${num(my)} ${num(tip - MARK)},${num(my + MARK / 2)}`,
      fill: label.color,
    });
    return triangle + svgText(tip - MARK - 1, my + size * 0.35, String(label.number), {
      anchor: 'end', fill: label.color, 'font-size': num(size),
    });
  }).join('');
}

/** トリガの水準 `◀T` (格子の右の余白) と位置 `▼` (上の余白、t = 0 = 中央)。 */
export function renderTriggerMarks(fraction: number | null, layout: Layout, theme: Theme, color: string): string {
  const { x, y, width, height } = layout.grid;
  const cx = x + width / 2;
  const top = element('polygon', {
    points: `${num(cx - MARK / 2)},${num(y - 1 - MARK)} ${num(cx + MARK / 2)},${num(y - 1 - MARK)} ${num(cx)},${num(y - 1)}`,
    fill: color,
  });
  if (fraction === null) return top;
  const my = y + (1 - fraction) * height;
  const tip = x + width + 1;
  return top + element('polygon', {
    points: `${num(tip + MARK)},${num(my - MARK / 2)} ${num(tip)},${num(my)} ${num(tip + MARK)},${num(my + MARK / 2)}`,
    fill: color,
  }) + svgText(tip + MARK + 1, my + theme.metrics.smallSize * 0.35, 'T', {
    anchor: 'start', fill: color, 'font-size': num(theme.metrics.smallSize),
  });
}
