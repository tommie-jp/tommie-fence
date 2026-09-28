import { formatPerDiv, formatSeconds, formatVolts, normalizeNewlines } from 'fence-kit';
import { notice } from './errors.ts';
import { idealOf } from './ideal.ts';
import { fitNotice, screenExtent } from './layout/fit.ts';
import { autoTimePerDiv, fractionY, niceStep125 } from './layout/scales.ts';
import { SIZE, createLayout } from './layout/screen.ts';
import { scaleOf, scaleSpecsOf } from './layout/traceScales.ts';
import type { ScaleSpec } from './layout/traceScales.ts';
import { LIMITS } from './limits.ts';
import type { ChannelSpec, TraceName } from './model/channel.ts';
import { CHANNEL_NAMES, TRACE_NAMES } from './model/channel.ts';
import type { MeasureName } from './model/measure.ts';
import { parseCsv } from './model/csv.ts';
import { formatQuantityPerDiv } from './model/quantity.ts';
import { readingsOf } from './model/readings.ts';
import type { Trace } from './model/readings.ts';
import { DIVISIONS, screenOf } from './model/screen.ts';
import type { Screen } from './model/screen.ts';
import { parseFence } from './parser/parseFence.ts';
import { renderDocument } from './render/document.ts';
import { groupMarks, renderChannelMark, renderGrid, renderStatus, renderTriggerMarks, statusLines } from './render/grid.ts';
import type { StatusItem } from './render/grid.ts';
import { keyText, readingLinesOf, readingsSize, renderKey, renderReadings } from './render/readings.ts';
import { channelColor, resolveStyle, traceColor } from './render/theme.ts';
import type { Theme } from './render/theme.ts';
import { renderTitle } from './render/title.ts';
import { renderCursor, renderTrace } from './render/trace.ts';
import type { Scale } from './render/trace.ts';
import { finishResult } from './result.ts';
import type { DataSource, RenderOptions, RenderResult } from './result.ts';
import type { FenceDocument, FenceError, TriggerSpec } from './types.ts';
import { renderXyView } from './xyView.ts';

export type { DataSource, RenderOptions, RenderResult } from './result.ts';
export { recordOf } from './ideal.ts';

/** `measure:` を書かなかったときに測る物。 */
const DEFAULT_MEASURES: readonly MeasureName[] = ['vpp', 'freq'];

type Measured = {
  readonly traces: readonly Trace[];
  readonly name: string | null;
  /** 記録の始めと終わり (s)。読めなければ null。 */
  readonly extent: readonly [number, number] | null;
  readonly said: readonly FenceError[];
};

const NOTHING: Omit<Measured, 'said'> = { traces: [], name: null, extent: null };

/**
 * `data:` を読む。**読めなくても図は出す** (言うことはお知らせ)。記録はまるごと持つ —
 * 描くのは画面の中だけ、読み値は記録全体から (実機のバッファと同じ)。
 * **トリガの探索は掛けない** (WaveForms の CSV の t = 0 がトリガ)。
 */
function readData(doc: FenceDocument, source: DataSource | undefined): Measured {
  if (doc.data === null) return { ...NOTHING, said: [] };
  const { name, line } = doc.data;
  if (source === undefined) {
    return { ...NOTHING, said: [notice(`この宿主では ${name} を読めません (CLI か VS Code の拡張で描くと実測が重なります)`, line, name)] };
  }
  let text: string | null;
  try {
    text = source(name);
  } catch {
    text = null;
  }
  if (text === null) return { ...NOTHING, said: [notice(`${name} が見つかりません (.md と同じ場所に置きます)`, line, name)] };
  const read = parseCsv(text);
  if (!read.ok) return { ...NOTHING, said: [notice(`${name} を読めません: ${read.reason}`, line, name)] };
  const t0 = read.time[0] ?? 0;
  const traces = read.columns.map((column): Trace => ({ name: column.name, samples: column.values, dt: read.dt, t0, basis: 'data' }));
  return {
    traces,
    name,
    extent: [t0, read.time[read.time.length - 1] ?? t0],
    said: read.notes.map((one) => notice(`${name}: ${one}`, line, name)),
  };
}

/** 書かれなかった trigger: の既定 (最初の ch の立ち上がり、水準は中央)。 */
const defaultTrigger = (channels: readonly ChannelSpec[]): TriggerSpec | null => {
  const first = channels[0];
  return first === undefined ? null : { source: first.name, edge: 'rising', level: null, line: null };
};

/** 描く線ごとの V/div と基準。**書いた range: / position: が先、無ければ Auto**。 */
function scalesOf(traces: readonly Trace[], specs: readonly ScaleSpec[]): ReadonlyMap<TraceName, Scale> {
  const scales = new Map<TraceName, Scale>();
  for (const name of TRACE_NAMES) {
    const shown = traces.filter((trace) => trace.name === name);
    if (shown.length > 0) scales.set(name, scaleOf(shown, specs.find((spec) => spec.name === name)));
  }
  return scales;
}

/**
 * 手で書いた尺度の読みにくさ (振れが 2 目盛未満・はみ出し)。**判定は読み値と同じ列** —
 * 実測があれば実測、無ければ理想の、画面の中の点で見る。振れの小ささは、同じ尺度で重ねた
 * 相手と比べて言うかを決めるので、線を全部そろえてから見る。Math は書き手の単位で言う。
 */
function fitNotices(traces: readonly Trace[], specs: readonly ScaleSpec[], scales: ReadonlyMap<TraceName, Scale>, screen: Screen): readonly FenceError[] {
  const inputs = specs.flatMap((spec) => {
    const trace = traces.find((one) => one.name === spec.name);
    const scale = scales.get(spec.name);
    const extent = trace === undefined ? null : screenExtent(trace, screen);
    if (extent === null || scale === undefined) return [];
    return [{ input: { name: spec.name, unit: spec.unit, extent, range: spec.range, position: spec.position, scale }, line: spec.line }];
  });
  const all = inputs.map((one) => one.input);
  return inputs.flatMap(({ input, line }) => {
    const message = fitNotice(input, all);
    return message === null ? [] : [notice(message, line)];
  });
}

function statusItems(scales: ReadonlyMap<TraceName, Scale>, specs: readonly ScaleSpec[], screen: Screen, trigger: TriggerSpec | null, level: number | null, theme: Theme): readonly StatusItem[] {
  const items: StatusItem[] = [...scales].map(([name, scale]) => ({
    text: `${name.toUpperCase()} ${formatQuantityPerDiv(scale.perDiv, specs.find((spec) => spec.name === name)?.unit)}`,
    fill: traceColor(theme, name),
  }));
  items.push({ text: formatPerDiv(screen.perDiv, 's'), fill: theme.palette.caption });
  if (trigger !== null) {
    items.push({
      text: `Trig ${trigger.source.toUpperCase()} ${trigger.edge === 'rising' ? '↑' : '↓'}${level === null ? '' : ` ${formatVolts(level)}`}`,
      fill: channelColor(theme, CHANNEL_NAMES.indexOf(trigger.source)),
    });
  }
  return items;
}

/** time: を書かなかったときの time/div と、言うこと。 */
function timeOf(doc: FenceDocument, measured: Measured): { readonly perDiv: number; readonly said: readonly FenceError[] } {
  const { channels } = doc;
  const fromRecord = channels.length === 0 && measured.extent !== null;
  if (doc.time !== null) return { perDiv: doc.time.perDiv, said: [] };
  const perDiv = fromRecord && measured.extent !== null
    ? Math.min(LIMITS.perDiv.max, Math.max(LIMITS.perDiv.min, niceStep125((measured.extent[1] - measured.extent[0]) / DIVISIONS.x)))
    : autoTimePerDiv(channels);
  // 書いたが読めなかった time: は読みのほうで言った。既定の言い直しは重ねない。
  if ((channels.length === 0 && !fromRecord) || doc.keys.includes('time')) return { perDiv, said: [] };
  const periodic = channels.some((channel) => channel.source.kind === 'wave' && channel.source.wave.frequency !== null);
  const why = fromRecord ? '記録の幅から' : periodic ? '一番遅い波の 2 周期' : '周期のある波が無いので既定';
  return { perDiv, said: [notice(`time: が無いので ${formatPerDiv(perDiv, 's')} (${why}) で描いています`, null)] };
}

/** 基準の印の番号 (ch は 1〜4、Math は M)。 */
const markLabel = (name: TraceName): number | string => (name === 'math' ? 'M' : CHANNEL_NAMES.indexOf(name) + 1);

/** カーソルのうち画面の中の物 (外の物は言う)。 */
function cursorsOn(doc: FenceDocument, screen: Screen, said: FenceError[]): readonly number[] {
  return doc.cursors.filter((cursor) => {
    const inside = cursor.t >= screen.left - 1e-15 && cursor.t <= screen.left + screen.span + 1e-15;
    if (!inside) said.push(notice(`カーソル ${formatSeconds(cursor.t)} は画面の外です (描いていません)`, cursor.line));
    return inside;
  }).map((cursor) => cursor.t);
}

/** 描く物 (時間の画面)。 */
type TimeScene = {
  readonly doc: FenceDocument;
  readonly screen: Screen;
  readonly trigger: TriggerSpec | null;
  readonly triggerLevel: number | null;
  readonly idealTraces: readonly Trace[];
  readonly measured: Measured;
  readonly cursors: readonly number[];
  readonly readings: ReturnType<typeof readingsOf>;
  readonly specs: readonly ScaleSpec[];
  readonly scales: ReadonlyMap<TraceName, Scale>;
};

/** 時間の画面を SVG に。 */
function drawTime(scene: TimeScene, style: ReturnType<typeof resolveStyle>): string {
  const { doc, screen, trigger, measured, scales } = scene;
  const { theme } = style;
  const drawn = [...scene.idealTraces, ...measured.traces];
  const groups = groupMarks([...scales].map(([name, scale]) => ({
    fraction: fractionY(0, scale.perDiv, scale.position), label: { number: markLabel(name), color: traceColor(theme, name) },
  })));
  const status = statusLines(statusItems(scales, scene.specs, screen, trigger, scene.triggerLevel, theme), scales.size, SIZE.div * DIVISIONS.x, theme);
  const layout = createLayout({
    statusRows: status.length,
    title: doc.title,
    key: drawn.length === 0 ? null : keyText(scene.idealTraces.length > 0, measured.name),
    readings: readingsSize(scene.readings, measured.name, theme),
    source: null,
    markSlots: Math.max(1, ...groups.map((group) => group.labels.length)),
    theme,
  });
  const traceSvg = drawn.map((trace) => {
    const scale = scales.get(trace.name);
    return scale === undefined ? '' : renderTrace(trace, layout.grid, screen, scale, traceColor(theme, trace.name));
  }).join('');
  const triggerScale = trigger === null ? undefined : scales.get(trigger.source);
  const triggerMarks = trigger === null || triggerScale === undefined
    ? ''
    : renderTriggerMarks(scene.triggerLevel === null ? null : fractionY(scene.triggerLevel, triggerScale.perDiv, triggerScale.position),
      layout, theme, channelColor(theme, CHANNEL_NAMES.indexOf(trigger.source)));
  const body = renderTitle(doc.title, layout, theme)
    + renderKey(scene.idealTraces.length > 0, measured.name, layout, theme)
    + renderGrid(layout, theme)
    + traceSvg
    + scene.cursors.map((t, index) => renderCursor(t, `X${index + 1}`, layout.grid, screen, theme)).join('')
    + groups.map((group) => renderChannelMark(group.labels, group.fraction, layout, theme)).join('')
    + triggerMarks
    + renderStatus(status, layout, theme)
    + (layout.readingsBand === null ? '' : renderReadings(scene.readings, measured.name, layout.readingsBand, theme));
  return renderDocument(layout, body, { theme, width: style.width, stamp: style.stamp });
}

/** 時間の画面 (view: time)。 */
function renderTime(doc: FenceDocument, source: string, options: RenderOptions, said: FenceError[]): RenderResult {
  const style = resolveStyle(doc.style);
  const { channels } = doc;
  const wrote = (key: string): boolean => doc.keys.includes(key);
  if (!doc.keys.some((key) => /^ch\d$/.test(key) || key === 'math') && doc.data === null && source.trim() !== '') {
    said.push(notice('ch1: が無いので格子だけ描いています (ch1: sine 1kHz 1V のように書きます)', null));
  }
  const measured = readData(doc, options.data);
  const time = timeOf(doc, measured);
  said.push(...time.said);
  const screen = screenOf(time.perDiv, LIMITS.samples);
  const trigger = doc.trigger ?? defaultTrigger(channels);
  if (!wrote('trigger') && trigger !== null) {
    said.push(notice(`trigger: が無いので ${trigger.source} の立ち上がり (水準は波形の中央) で合わせています`, null));
  }

  const ideal = idealOf(doc, screen, trigger);
  said.push(...ideal.said, ...measured.said);
  if (measured.extent !== null && doc.data !== null
    && (measured.extent[1] < screen.left || measured.extent[0] > screen.left + screen.span)) {
    said.push(notice(`${doc.data.name} には画面 (${formatSeconds(screen.left)}〜${formatSeconds(screen.left + screen.span)}) の中の点がありません`, doc.data.line, doc.data.name));
  }
  const cursors = cursorsOn(doc, screen, said);

  // 読み値は線ごとに実測があれば実測、無ければ理想 (Math はいつも理想)。
  const readingTraces = TRACE_NAMES.flatMap((name) => {
    const one = measured.traces.find((trace) => trace.name === name) ?? ideal.traces.find((trace) => trace.name === name);
    return one === undefined ? [] : [one];
  });
  const readings = readingsOf({ traces: readingTraces, cursors, measures: doc.measures ?? DEFAULT_MEASURES });
  const specs = scaleSpecsOf(doc);
  const scales = scalesOf([...ideal.traces, ...measured.traces], specs);
  said.push(...fitNotices(readingTraces, specs, scales, screen));

  const svg = drawTime({
    doc, screen, trigger, triggerLevel: ideal.triggerLevel, idealTraces: ideal.traces, measured, cursors, readings, specs, scales,
  }, style);
  return finishResult({
    source, said, svg, readings, readingLines: readingLinesOf(readings, measured.name), debug: style.debug, offset: options.offset ?? 0,
  });
}

/**
 * フェンスの中身 1 つを図に変換する。DOM も Node も使わない同期の純関数なので、
 * VS Code のプレビュー・CLI・ブラウザのどこからでも同じように呼べる。
 */
export function renderScope(input: string, options: RenderOptions = {}): RenderResult {
  const source = normalizeNewlines(input);
  const { doc, errors } = parseFence(source);
  const said: FenceError[] = [...errors];
  return doc.view === 'xy' ? renderXyView(doc, source, options, said) : renderTime(doc, source, options, said);
}

export { extractScopeFences } from './fences.ts';
export type { FenceBlock } from './fences.ts';
export type { FenceError } from './types.ts';
export type { Readings } from './model/readings.ts';
export { errorText } from './render/errorText.ts';
export { STAMP_TEXT, VERSION } from './version.ts';
export { problemsOf } from './problems.ts';
