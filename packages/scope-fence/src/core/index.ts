import { formatPerDiv, formatSeconds, formatVolts, normalizeNewlines } from 'fence-kit';
import { attachSourceText, notice, shiftErrors } from './errors.ts';
import { autoRange, autoTimePerDiv, fractionY, niceStep125 } from './layout/scales.ts';
import { SIZE, createLayout } from './layout/screen.ts';
import { LIMITS } from './limits.ts';
import type { ChannelName, ChannelSpec } from './model/channel.ts';
import { CHANNEL_NAMES, samplesOf } from './model/channel.ts';
import type { MeasureName } from './model/measure.ts';
import { parseCsv } from './model/csv.ts';
import { readingsOf } from './model/readings.ts';
import type { Readings, Trace } from './model/readings.ts';
import { DIVISIONS, findTrigger, screenOf } from './model/screen.ts';
import type { Screen } from './model/screen.ts';
import { parseFence } from './parser/parseFence.ts';
import { renderDocument } from './render/document.ts';
import { renderErrorBanner } from './render/errorHtml.ts';
import { renderChannelMark, renderGrid, renderStatus, renderTriggerMarks, statusLines } from './render/grid.ts';
import type { MarkLabel, StatusItem } from './render/grid.ts';
import { keyText, readingLinesOf, readingsSize, renderKey, renderReadings } from './render/readings.ts';
import { channelColor, resolveStyle } from './render/theme.ts';
import type { Theme } from './render/theme.ts';
import { renderTitle } from './render/title.ts';
import { renderCursor, renderTrace } from './render/trace.ts';
import type { Scale } from './render/trace.ts';
import type { FenceDocument, FenceError, TriggerSpec } from './types.ts';

/** 行の無いものを先に、あとは行の順に。同じ行なら見つけた順を保つ。 */
const byLine = (errors: readonly FenceError[]): FenceError[] =>
  [...errors].sort((a, b) => (a.line ?? 0) - (b.line ?? 0));

/** `measure:` を書かなかったときに測る物。 */
const DEFAULT_MEASURES: readonly MeasureName[] = ['vpp', 'freq'];

/**
 * `data:` のファイルを読む口。**core はファイルを開かない** — 開くのは宿主
 * (CLI は `.md` の隣、拡張は開いている文書の隣)。名前は core が `DATA_NAME` で
 * 絞ったものだけが来る。見つからなければ null。
 */
export type DataSource = (name: string) => string | null;

export type RenderResult = {
  /** それ自体で完結した SVG。**格子は必ず描く** (読めなかった行があっても、読めた所まで)。 */
  readonly svg: string;
  /** 読み値 (Measurements とカーソル)。**エスケープしていない生のデータ**。 */
  readonly readings: Readings;
  /** 読み値を字の行にしたもの (CLI と playground が出す)。 */
  readonly readingLines: readonly string[];
  /** 読めなかったところ。行番号と、行の中身と、綴りを指す印を持つ。 */
  readonly errors: readonly FenceError[];
  /** 読めてはいるが、思ったとおりには出ないところ。 */
  readonly notices: readonly FenceError[];
  /** 図の下に貼る帯の HTML。言うことが無ければ空文字列。**SVG には何も書き込まない**。 */
  readonly errorHtml: string;
};

export type RenderOptions = {
  /** フェンスが始まる行 (Markdown の中での 1 始まり)。言うことの行番号を Markdown の行に直す。 */
  readonly offset?: number;
  /** `data:` のファイルを読む口。渡さなければ「この宿主では読めません」と言って理想だけ描く。 */
  readonly data?: DataSource;
};

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

type Ideal = {
  readonly traces: readonly Trace[];
  /** トリガの水準 (V。null なら印を描かない)。 */
  readonly triggerLevel: number | null;
  readonly said: readonly FenceError[];
};

/** 記録を画面より長くするときの周期の数と、画面に対する長さの上限。 */
const RECORD_PERIODS = 2.2;
const RECORD_MAX = 3;

/**
 * 理想の記録 (測る範囲)。**画面に 2 周期入らないときは、前後を足して 2.2 周期にする**
 * (画面の 3 倍まで)。実機のバッファが画面より長いのと同じで、5-1 の `1ms/div` (画面に
 * ちょうど 1 周期) でも Freq が出る。描くのは画面の中だけ。点の間隔は画面と同じ。
 */
export function recordOf(screen: Screen, channels: readonly ChannelSpec[]): Screen {
  const periods = channels.flatMap((channel) =>
    (channel.source.kind === 'wave' && channel.source.wave.frequency !== null ? [1 / channel.source.wave.frequency] : []));
  const longest = Math.max(0, ...periods);
  const wanted = RECORD_PERIODS * longest;
  if (wanted <= screen.span || wanted > RECORD_MAX * screen.span) return screen;
  const samples = Math.ceil(wanted / screen.dt / 2) * 2 + 1;
  const span = (samples - 1) * screen.dt;
  return { perDiv: screen.perDiv, span, samples, left: -span / 2, dt: screen.dt };
}

/** 理想の波を計算する。トリガの横切りを探して t = 0 を合わせる。 */
function idealOf(doc: FenceDocument, display: Screen, trigger: TriggerSpec | null): Ideal {
  const said: FenceError[] = [];
  const { channels } = doc;
  if (channels.length === 0) return { traces: [], triggerLevel: null, said };
  const screen = recordOf(display, channels);
  const first = samplesOf(channels, screen, 0);
  let shift = 0;
  let triggerLevel: number | null = null;
  const source = trigger === null ? undefined : first.samples.get(trigger.source);
  if (trigger !== null && source !== undefined) {
    const found = findTrigger(source, screen, trigger.edge, trigger.level);
    if (found === null) {
      const level = trigger.level === null ? '中央' : formatVolts(trigger.level);
      said.push(notice(`トリガ水準 (${level}) が ${trigger.source} の波形の外なので、t = 0 に合わせていません`, trigger.line));
    } else {
      shift = found;
    }
    let min = Infinity;
    let max = -Infinity;
    for (const value of source) {
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
    triggerLevel = trigger.level ?? (max + min) / 2;
  }
  const final = shift === 0 ? first : samplesOf(channels, screen, shift);
  if (!final.settled) said.push(notice('rc の τ が画面の幅に比べて長いので、定常まで回しきれていません (time: を遅くします)', null));
  for (const channel of channels) {
    for (const op of channel.ops) {
      if (op.kind === 'rc' && op.tau < screen.dt) {
        said.push(notice(`rc の τ (${formatSeconds(op.tau)}) が画面の点の間隔 (${formatSeconds(screen.dt)}) より短いので、ほぼ素通しに描いています`, channel.line));
      }
    }
  }
  const traces = channels.map((channel): Trace => ({
    name: channel.name,
    samples: final.samples.get(channel.name) ?? new Float64Array(screen.samples),
    dt: screen.dt,
    t0: screen.left,
    basis: 'model',
  }));
  return { traces, triggerLevel, said };
}

/** 描く ch ごとの V/div と基準。**書いた range: / position: が先、無ければ Auto**。 */
function scalesOf(traces: readonly Trace[], channels: readonly ChannelSpec[]): ReadonlyMap<ChannelName, Scale> {
  const scales = new Map<ChannelName, Scale>();
  for (const name of CHANNEL_NAMES) {
    const shown = traces.filter((trace) => trace.name === name);
    if (shown.length === 0) continue;
    const spec = channels.find((channel) => channel.name === name);
    const joined = Float64Array.from(shown.flatMap((trace) => [...trace.samples]));
    const auto = autoRange(joined, spec?.range ?? null);
    scales.set(name, { perDiv: auto.perDiv, position: spec?.position ?? auto.position });
  }
  return scales;
}

function statusItems(scales: ReadonlyMap<ChannelName, Scale>, screen: Screen, trigger: TriggerSpec | null, level: number | null, theme: Theme): readonly StatusItem[] {
  const items: StatusItem[] = [...scales].map(([name, scale]) => ({
    text: `${name.toUpperCase()} ${formatPerDiv(scale.perDiv, 'V')}`,
    fill: channelColor(theme, CHANNEL_NAMES.indexOf(name)),
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

/**
 * フェンスの中身 1 つを図に変換する。DOM も Node も使わない同期の純関数なので、
 * VS Code のプレビュー・CLI・ブラウザのどこからでも同じように呼べる。
 */
export function renderScope(input: string, options: RenderOptions = {}): RenderResult {
  const source = normalizeNewlines(input);
  const parsed = parseFence(source);
  const { doc } = parsed;
  const style = resolveStyle(doc.style);
  const { theme } = style;
  const said: FenceError[] = [];
  const { channels } = doc;

  const wrote = (key: string): boolean => doc.keys.includes(key);
  if (!doc.keys.some((key) => /^ch\d$/.test(key)) && doc.data === null && source.trim() !== '') {
    said.push(notice('ch1: が無いので格子だけ描いています (ch1: sine 1kHz 1V のように書きます)', null));
  }
  const measured = readData(doc, options.data);
  // time: が無く data: だけなら、記録の幅 / 10 を 1-2-5 に丸める。
  const fromRecord = channels.length === 0 && measured.extent !== null;
  const perDiv = doc.time?.perDiv ?? (fromRecord && measured.extent !== null
    ? Math.min(LIMITS.perDiv.max, Math.max(LIMITS.perDiv.min, niceStep125((measured.extent[1] - measured.extent[0]) / DIVISIONS.x)))
    : autoTimePerDiv(channels));
  if (!wrote('time') && (channels.length > 0 || fromRecord)) {
    const why = fromRecord ? '記録の幅から' : '一番遅い波の 2 周期';
    said.push(notice(`time: が無いので ${formatPerDiv(perDiv, 's')} (${why}) で描いています`, null));
  }
  const screen = screenOf(perDiv, LIMITS.samples);
  const trigger = doc.trigger ?? defaultTrigger(channels);
  if (!wrote('trigger') && trigger !== null) {
    said.push(notice(`trigger: が無いので ${trigger.source} の立ち上がり (水準は波形の中央) で合わせています`, null));
  }

  const ideal = idealOf(doc, screen, trigger);
  said.push(...ideal.said);
  said.push(...measured.said);
  if (measured.extent !== null && doc.data !== null
    && (measured.extent[1] < screen.left || measured.extent[0] > screen.left + screen.span)) {
    said.push(notice(`${doc.data.name} には画面 (${formatSeconds(screen.left)}〜${formatSeconds(screen.left + screen.span)}) の中の点がありません`, doc.data.line, doc.data.name));
  }

  const cursors = doc.cursors.filter((cursor) => {
    const inside = cursor.t >= screen.left - 1e-15 && cursor.t <= screen.left + screen.span + 1e-15;
    if (!inside) said.push(notice(`カーソル ${formatSeconds(cursor.t)} は画面の外です (描いていません)`, cursor.line));
    return inside;
  }).map((cursor) => cursor.t);

  // 読み値は ch ごとに実測があれば実測、無ければ理想。
  const readingTraces = CHANNEL_NAMES.flatMap((name) => {
    const one = measured.traces.find((trace) => trace.name === name) ?? ideal.traces.find((trace) => trace.name === name);
    return one === undefined ? [] : [one];
  });
  const readings = readingsOf({ traces: readingTraces, cursors, measures: doc.measures ?? DEFAULT_MEASURES });

  const drawn = [...ideal.traces, ...measured.traces];
  const scales = scalesOf(drawn, channels);
  const key = drawn.length === 0 ? null : keyText(ideal.traces.length > 0, measured.name);
  const status = statusLines(statusItems(scales, screen, trigger, ideal.triggerLevel, theme), scales.size, SIZE.div * DIVISIONS.x, theme);
  const layout = createLayout({
    statusRows: status.length,
    title: doc.title,
    key,
    readings: readingsSize(readings, measured.name, theme),
    source: null,
    theme,
  });

  const traceSvg = drawn.map((trace) => {
    const scale = scales.get(trace.name);
    return scale === undefined ? '' : renderTrace(trace, layout.grid, screen, scale, channelColor(theme, CHANNEL_NAMES.indexOf(trace.name)));
  }).join('');
  // 0 V の基準が同じ高さ (印の高さより近い) の ch は 1 つの印にまとめる (重なると番号が読めない)。
  const groups: { readonly fraction: number; readonly labels: MarkLabel[] }[] = [];
  for (const [name, scale] of scales) {
    const index = CHANNEL_NAMES.indexOf(name);
    const fraction = fractionY(0, scale.perDiv, scale.position);
    const label = { number: index + 1, color: channelColor(theme, index) };
    const group = groups.find((one) => Math.abs(one.fraction - fraction) * layout.grid.height < 8);
    if (group === undefined) groups.push({ fraction, labels: [label] });
    else group.labels.push(label);
  }
  const marks = groups.map((group) => renderChannelMark(group.labels, group.fraction, layout, theme)).join('');
  const triggerScale = trigger === null ? undefined : scales.get(trigger.source);
  const triggerMarks = trigger === null || triggerScale === undefined
    ? ''
    : renderTriggerMarks(ideal.triggerLevel === null ? null : fractionY(ideal.triggerLevel, triggerScale.perDiv, triggerScale.position),
      layout, theme, channelColor(theme, CHANNEL_NAMES.indexOf(trigger.source)));

  const body = renderTitle(doc.title, layout, theme)
    + renderKey(ideal.traces.length > 0, measured.name, layout, theme)
    + renderGrid(layout, theme)
    + traceSvg
    + cursors.map((t, index) => renderCursor(t, `X${index + 1}`, layout.grid, screen, theme)).join('')
    + marks
    + triggerMarks
    + renderStatus(status, layout, theme)
    + (layout.readingsBand === null ? '' : renderReadings(readings, measured.name, layout.readingsBand, theme));
  const svg = renderDocument(layout, body, { theme, width: style.width, stamp: style.stamp });

  const reported = attachSourceText(byLine([...parsed.errors, ...said]), source);
  const at = (list: readonly FenceError[]): readonly FenceError[] => shiftErrors(list, options.offset ?? 0);
  const errors = at(reported.filter((error) => error.notice !== true));
  const notices = at(reported.filter((error) => error.notice === true));
  return {
    svg,
    readings,
    readingLines: readingLinesOf(readings, measured.name),
    errors,
    notices,
    errorHtml: renderErrorBanner(style.debug ? [...errors, ...notices] : errors),
  };
}

export { extractScopeFences } from './fences.ts';
export type { FenceBlock } from './fences.ts';
export type { FenceError } from './types.ts';
export type { Readings } from './model/readings.ts';
export { errorText } from './render/errorText.ts';
export { STAMP_TEXT, VERSION } from './version.ts';
export { problemsOf } from './problems.ts';
