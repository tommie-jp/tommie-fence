import { element, fit, formatPerDiv, num, svgText } from 'fence-kit';
import { LIMITS } from '../limits.ts';
import { OUTER } from '../layout/screen.ts';
import type { Layout } from '../layout/screen.ts';
import { PLOT } from '../model/window.ts';
import type { Window } from '../model/window.ts';
import { axisLabel, axisUnit, hertzText } from '../model/time.ts';
import type { Theme } from './theme.ts';

/**
 * 格子 — 枠・縦 10 目盛・行の区切り・時間軸の字・状態の行。**空でも必ず描く** (52 の docs/54)。
 * 時間軸の字は**単位を 1 つに揃える** (`axisUnit`: 1 目盛が 1 以上になる一番大きい単位)。
 */
export function renderGrid(layout: Layout, theme: Theme): string {
  const { plot } = layout;
  const parts: string[] = [];
  for (let index = 1; index < LIMITS.divisions; index += 1) {
    const x = plot.x + index * PLOT.divPx;
    parts.push(element('line', { x1: num(x), y1: num(plot.y), x2: num(x), y2: num(plot.y + plot.height), stroke: theme.palette.grid, 'stroke-width': 1 }));
  }
  for (let index = 1; index < layout.rowCount; index += 1) {
    const y = plot.y + index * (plot.height / layout.rowCount);
    parts.push(element('line', { x1: num(plot.x), y1: num(y), x2: num(plot.x + plot.width), y2: num(y), stroke: theme.palette.grid, 'stroke-width': 1 }));
  }
  parts.push(element('rect', {
    x: num(plot.x), y: num(plot.y), width: num(plot.width), height: num(plot.height), fill: 'none', stroke: theme.palette.frame, 'stroke-width': 1,
  }));
  return parts.join('');
}

/** 時間軸の字 (格子の下、目盛ごと)。 */
export function renderAxis(layout: Layout, window: Window, theme: Theme): string {
  const unit = axisUnit(window.perDiv);
  const labels: string[] = [];
  for (let index = 0; index <= LIMITS.divisions; index += 1) {
    labels.push(svgText(layout.plot.x + index * PLOT.divPx, layout.axisBaseline, axisLabel(window.t0 + index * window.perDiv, unit), {
      anchor: 'middle', fill: theme.palette.label, 'font-size': num(theme.metrics.smallSize),
    }));
  }
  return labels.join('');
}

/** 状態の行の字。**書き手が読む設定を 1 行に** (機種・1 目盛・窓・標本化・トリガ)。 */
export function statusText(options: {
  readonly device: string | null; readonly window: Window; readonly sample: number | null; readonly trigger: string | null;
}): string {
  const { device, window, sample, trigger } = options;
  const items = [
    ...(device === null ? [] : [device]),
    formatPerDiv(window.perDiv, 's'),
    `窓 ${axisLabel(window.t1 - window.t0, axisUnit(window.t1 - window.t0))}`,
    ...(sample === null ? [] : [`sample ${hertzText(sample)}`]),
    ...(trigger === null ? [] : [`trigger ${trigger}`]),
  ];
  return items.join('  ·  ');
}

export function renderStatus(text: string, layout: Layout, theme: Theme): string {
  const size = theme.metrics.smallSize;
  return svgText(OUTER, layout.statusBaseline, fit(text, (layout.width - OUTER * 2) / size), {
    anchor: 'start', fill: theme.palette.caption, 'font-size': num(size),
  });
}
