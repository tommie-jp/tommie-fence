import { samplingNotices, tracesOf } from './ideal.ts';
import { fractionY } from './layout/scales.ts';
import { SIZE, createLayout } from './layout/screen.ts';
import { scaleOf, scaleSpecsOf } from './layout/traceScales.ts';
import { LIMITS } from './limits.ts';
import { samplesOf } from './model/channel.ts';
import type { ChannelSpec } from './model/channel.ts';
import { formatQuantityPerDiv } from './model/quantity.ts';
import { readingsOf } from './model/readings.ts';
import type { Trace } from './model/readings.ts';
import { DIVISIONS, screenOf } from './model/screen.ts';
import { renderDocument } from './render/document.ts';
import { renderChannelMark, renderGrid, renderStatus, statusLines } from './render/grid.ts';
import { keyText, readingLinesOf, readingsSize, renderKey, renderReadings } from './render/readings.ts';
import { resolveStyle, traceColor } from './render/theme.ts';
import { renderTitle } from './render/title.ts';
import type { Scale } from './render/trace.ts';
import { renderXMark, renderXyCurve, xyPoints } from './render/xy.ts';
import { finishResult } from './result.ts';
import type { RenderOptions, RenderResult } from './result.ts';
import type { FenceDocument, FenceError } from './types.ts';

/**
 * XY の画面 (`view: xy`)。**横と縦の 2 本の線を点ごとに組にして描く** — リサージュと V–I の曲線。
 * 格子は 8 × 8 (両軸 8 目盛)、尺度は軸ごとに Auto の 1-2-5 か書いた range:。読み値は各軸の
 * Vpp・Vmax・Vmin (V–I の曲線は端の値を読む。52 の docs/99 決め 3)。
 *
 * 標本化の窓は**周波数の揃う最短の時間** (1 kHz と 1.5 kHz なら 2 ms) — 閉じた曲線が
 * ちょうど 1 周して閉じる。周期のある波が無ければ 10 ms。
 */
export const XY_DIVISIONS = { x: 8, y: 8 } as const;

const XY_MEASURES = ['vpp', 'vmax', 'vmin'] as const;
/** 周波数の揃う窓を探す最も遅い波の周期の数。揃わなければ最も遅い波の 1 周期。 */
const MAX_TURNS = 20;
const TOLERANCE = 1e-6;
const DEFAULT_WINDOW = 10e-3;

/** 標本化する窓 (s)。 */
export function xyWindow(channels: readonly ChannelSpec[]): number {
  const frequencies = channels.flatMap((channel) =>
    (channel.source.kind === 'wave' && channel.source.wave.frequency !== null ? [channel.source.wave.frequency] : []));
  if (frequencies.length === 0) return DEFAULT_WINDOW;
  const slowest = Math.min(...frequencies);
  for (let turns = 1; turns <= MAX_TURNS; turns += 1) {
    const base = slowest / turns;
    if (frequencies.every((f) => Math.abs(f / base - Math.round(f / base)) < TOLERANCE * (f / base))) return turns / slowest;
  }
  return 1 / slowest;
}

type Axes = { readonly x: Trace; readonly y: Trace; readonly xScale: Scale; readonly yScale: Scale };

/** 軸 2 本と尺度。軸が読めなければ null (格子だけ描く)。 */
function axesOf(doc: FenceDocument, traces: readonly Trace[]): Axes | null {
  if (doc.xy === null) return null;
  const x = traces.find((trace) => trace.name === doc.xy?.x);
  const y = traces.find((trace) => trace.name === doc.xy?.y);
  if (x === undefined || y === undefined) return null;
  const specs = scaleSpecsOf(doc);
  return {
    x, y,
    xScale: scaleOf([x], specs.find((spec) => spec.name === x.name)),
    yScale: scaleOf([y], specs.find((spec) => spec.name === y.name)),
  };
}

const statusText = (axis: 'X' | 'Y', trace: Trace, scale: Scale): string =>
  `${axis} ${trace.name.toUpperCase()} ${formatQuantityPerDiv(scale.perDiv, trace.unit)}`;

function drawXy(doc: FenceDocument, axes: Axes | null, readings: ReturnType<typeof readingsOf>, style: ReturnType<typeof resolveStyle>): string {
  const { theme } = style;
  const items = axes === null ? [{ text: 'XY', fill: theme.palette.caption }] : [
    { text: statusText('X', axes.x, axes.xScale), fill: traceColor(theme, axes.x.name) },
    { text: statusText('Y', axes.y, axes.yScale), fill: traceColor(theme, axes.y.name) },
  ];
  const status = statusLines(items, items.length, SIZE.div * XY_DIVISIONS.x, theme);
  const layout = createLayout({
    statusRows: status.length,
    title: doc.title,
    key: axes === null ? null : keyText(true, null),
    readings: readingsSize(readings, null, theme),
    source: null,
    divisions: XY_DIVISIONS,
    theme,
  });
  const curve = axes === null ? '' : renderXyCurve(xyPoints(axes.x.samples, axes.y.samples, layout.grid, axes.xScale, axes.yScale), traceColor(theme, axes.y.name));
  const marks = axes === null ? '' : renderChannelMark(
    [{ number: axes.y.name === 'math' ? 'M' : axes.y.name.slice(2), color: traceColor(theme, axes.y.name) }],
    fractionY(0, axes.yScale.perDiv, axes.yScale.position), layout, theme,
  ) + renderXMark(axes.x.name === 'math' ? 'M' : axes.x.name.slice(2), fractionY(0, axes.xScale.perDiv, axes.xScale.position), layout, theme, traceColor(theme, axes.x.name));
  const body = renderTitle(doc.title, layout, theme)
    + renderKey(axes !== null, null, layout, theme)
    + renderGrid(layout, theme, XY_DIVISIONS)
    + curve
    + marks
    + renderStatus(status, layout, theme)
    + (layout.readingsBand === null ? '' : renderReadings(readings, null, layout.readingsBand, theme));
  return renderDocument(layout, body, { theme, width: style.width, stamp: style.stamp });
}

/** XY の画面を描く。時刻のずれ (トリガ) は無い。 */
export function renderXyView(doc: FenceDocument, source: string, options: RenderOptions, said: FenceError[]): RenderResult {
  const style = resolveStyle(doc.style);
  const screen = screenOf(xyWindow(doc.channels) / DIVISIONS.x, LIMITS.samples);
  const drawable = doc.channels.length > 0 || doc.math !== null;
  const sampled = drawable ? samplesOf(doc.channels, screen, 0, doc.math?.expr ?? null) : null;
  if (sampled !== null) said.push(...samplingNotices(doc, sampled, screen));
  const traces = sampled === null ? [] : tracesOf(doc, sampled, screen);
  const axes = axesOf(doc, traces);
  const readings = readingsOf({ traces: axes === null ? [] : [axes.x, axes.y], cursors: [], measures: XY_MEASURES });
  const svg = drawXy(doc, axes, readings, style);
  return finishResult({
    source, said, svg, readings, readingLines: readingLinesOf(readings, null), debug: style.debug, offset: options.offset ?? 0,
  });
}
