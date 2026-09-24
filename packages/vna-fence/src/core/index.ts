import { normalizeNewlines } from 'fence-kit';
import { attachSourceText, notice, shiftErrors } from './errors.ts';
import { createLayout } from './layout/figure.ts';
import { groupPanels, isRound } from './layout/panels.ts';
import type { Panel, PanelTrace } from './layout/panels.ts';
import { rangeNotice } from './model/device.ts';
import { endOf, sparamsOf } from './model/dut.ts';
import { formatHertzShort } from './model/frequency.ts';
import { readingsOf } from './model/readings.ts';
import type { Readings } from './model/readings.ts';
import { isEvenlySpaced, seriesOf } from './model/series.ts';
import type { Series, TdrSeries } from './model/series.ts';
import type { SPoint } from './model/sparams.ts';
import { frequenciesOf } from './model/sweep.ts';
import { parseTouchstone, portsOf } from './model/touchstone.ts';
import { parseFence } from './parser/parseFence.ts';
import { renderDocument } from './render/document.ts';
import { renderErrorBanner } from './render/errorHtml.ts';
import { linesSize, renderLines, sourceListing, tableLines } from './render/mono.ts';
import { UNIT_PANELS, renderPanel } from './render/panel.ts';
import { keyText, readingsHeading, readingsSize, renderKey, renderReadings } from './render/readings.ts';
import { resolveStyle } from './render/theme.ts';
import { renderTitle } from './render/title.ts';
import type { FenceDocument, FenceError, NoteSpec } from './types.ts';

/** 行の無いものを先に、あとは行の順に。同じ行なら見つけた順を保つ。 */
const byLine = (errors: readonly FenceError[]): FenceError[] =>
  [...errors].sort((a, b) => (a.line ?? 0) - (b.line ?? 0));

/**
 * `data:` のファイルを読む口。**core はファイルを開かない** — 開くのは宿主
 * (CLI は `.md` の隣、拡張は開いている文書の隣)。名前は core が `DATA_NAME` で
 * 絞ったものだけが来る。見つからなければ null。
 */
export type DataSource = (name: string) => string | null;

export type RenderResult = {
  /** それ自体で完結した SVG。**枠は必ず描く** (読めなかった行があっても、読めた所まで)。 */
  readonly svg: string;
  /** マーカーの読み値。**エスケープしていない生のデータ**。 */
  readonly readings: Readings;
  /** 読み値を字の行にしたもの (CLI の `--verbose` と playground が出す)。 */
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

type Measured = { readonly points: readonly SPoint[] | null; readonly said: readonly FenceError[] };

/** `data:` を読み、掃引の中の点だけ残す。**読めなくても図は出す** (言うことはお知らせ)。 */
function readData(doc: FenceDocument, source: DataSource | undefined): Measured {
  if (doc.data === null) return { points: null, said: [] };
  const { name, line } = doc.data;
  if (source === undefined) {
    return { points: null, said: [notice(`この宿主では ${name} を読めません (CLI か VS Code の拡張で描くと実測が重なります)`, line, name)] };
  }
  let text: string | null;
  try {
    text = source(name);
  } catch {
    text = null;
  }
  if (text === null) return { points: null, said: [notice(`${name} が見つかりません (.md と同じ場所に置きます)`, line, name)] };
  const read = parseTouchstone(text, portsOf(name) ?? 2);
  if (!read.ok) return { points: null, said: [notice(`${name} を読めません: ${read.reason}`, line, name)] };
  const said: FenceError[] = [];
  if (read.value.z0 !== 50) said.push(notice(`${name} の基準は ${read.value.z0} Ω です (50 Ω として描いています)`, line, name));
  const inside = read.value.points.filter((point) => point.f >= doc.sweep.start && point.f <= doc.sweep.stop);
  if (inside.length === 0) {
    said.push(notice(`${name} には掃引 (${formatHertzShort(doc.sweep.start)}〜${formatHertzShort(doc.sweep.stop)}) の中の点がありません`, line, name));
    return { points: null, said };
  }
  return { points: inside, said };
}

/** 描けない組をお知らせにする (1 端子の模型に S21、`.s1p` に S21、不等間隔の TDR)。 */
function traceNotices(doc: FenceDocument, data: readonly SPoint[] | null, traces: readonly PanelTrace[]): FenceError[] {
  const said: FenceError[] = [];
  const end = endOf(doc.dut);
  for (const { spec } of traces) {
    if (spec.param === 'S21' && end !== null && doc.dut.length > 0) {
      said.push(notice(`模型が ${end} で終わるので S21 の理想は描きません (CH1 に繋がっていません)`, spec.line));
    }
    if (spec.param === 'S21' && data !== null && data.every((point) => point.s21 === null)) {
      said.push(notice(`${doc.data?.name ?? 'data'} は 1 端子 (.s1p) なので S21 の実測はありません`, spec.line));
    }
    if (spec.format === 'tdr' && data !== null && !isEvenlySpaced(data)) {
      said.push(notice('実測の点が等間隔でないので TDR を描けません (等間隔の掃引で測ります)', spec.line));
    }
  }
  return said;
}

/** 注釈を枠に配る。**単位の合う枠が無い注釈は言う** (黙って消さない)。 */
function notesFor(panels: readonly Panel[], notes: readonly NoteSpec[]): { readonly byPanel: ReadonlyMap<Panel, readonly NoteSpec[]>; readonly said: readonly FenceError[] } {
  const byPanel = new Map<Panel, NoteSpec[]>(panels.map((panel) => [panel, []]));
  const said: FenceError[] = [];
  for (const note of notes) {
    if (note.kind === 'source') continue;
    if (note.kind === 'band') {
      const targets = panels.filter((panel) => !isRound(panel.kind) && panel.kind !== 'tdr');
      if (targets.length === 0) said.push(notice('band を塗る枠がありません (周波数が横軸の枠に塗ります)', note.line));
      for (const panel of targets) byPanel.get(panel)?.push(note);
      continue;
    }
    const target = UNIT_PANELS[note.unit].map((kind) => panels.find((panel) => panel.kind === kind)).find((panel) => panel !== undefined);
    if (target === undefined) {
      said.push(notice(`注釈の値の単位に合う枠がありません (${note.unit === 'none' ? '単位の無い数は SWR か linear の枠' : `${note.unit} の枠`})`, note.line));
      continue;
    }
    byPanel.get(target)?.push(note);
  }
  return { byPanel, said };
}

/**
 * フェンスの中身 1 つを図に変換する。DOM も Node も使わない同期の純関数なので、
 * VS Code のプレビュー・CLI・ブラウザのどこからでも同じように呼べる。
 */
export function renderVna(input: string, options: RenderOptions = {}): RenderResult {
  const source = normalizeNewlines(input);
  const parsed = parseFence(source);
  const { doc } = parsed;
  const style = resolveStyle(doc.style);
  const { theme } = style;
  const said: FenceError[] = [];

  const range = rangeNotice(doc.device, doc.sweep.start, doc.sweep.stop);
  if (range !== null) said.push(notice(range, null));

  const model = doc.dut.length > 0 ? sparamsOf(doc.dut, frequenciesOf(doc.sweep)) : null;
  const measured = readData(doc, options.data);
  said.push(...measured.said);
  const data = measured.points;
  if (doc.dut.length === 0 && doc.data === null) {
    said.push(notice('dut: も data: も無いので、枠だけを描いています', null));
  }

  const groups = groupPanels(doc.traces);
  const traces = groups.flatMap((group) => group.traces).sort((a, b) => a.index - b.index);
  said.push(...traceNotices(doc, data, traces));

  const markers = doc.markers.filter((marker) => {
    const inside = marker.f >= doc.sweep.start && marker.f <= doc.sweep.stop;
    if (!inside) said.push(notice(`マーカー ${formatHertzShort(marker.f)} は掃引の外です (描いていません)`, marker.line));
    return inside;
  });

  const seriesFor = (trace: PanelTrace): readonly Series[] => [
    ...(model === null ? [] : [seriesOf(trace, model, 'model')]),
    ...(data === null ? [] : [seriesOf(trace, data, 'data')]),
  ].filter((one): one is Series => one !== null);
  const allSeries = traces.flatMap(seriesFor);

  const tdr = allSeries.filter((one): one is TdrSeries => one.kind === 'tdr');
  const step = (doc.sweep.stop - doc.sweep.start) / (doc.sweep.points - 1);
  const readings = readingsOf({ traces, markers, dut: doc.dut, step, data, tdr });
  const dataName = data === null ? null : doc.data?.name ?? null;

  const sourceNotes = doc.notes.filter((note) => note.kind === 'source');
  for (const extra of sourceNotes.slice(1)) said.push(notice('書き出し (source) は 1 つだけ描きます (後のものは描いていません)', extra.line));
  const listing = sourceNotes.length > 0 ? sourceListing(source) : [];

  const key = keyText(model !== null, dataName);
  const layout = createLayout({
    title: doc.title,
    key,
    groups,
    readings: readingsSize(readings, dataName, theme),
    source: listing.length > 0 ? linesSize(listing, theme) : null,
    theme,
  });
  const placed = notesFor(layout.panels, doc.notes);
  said.push(...placed.said);

  const body = renderTitle(doc.title, layout, theme)
    + renderKey(model !== null, dataName, layout, theme)
    + layout.panels.map((panel) => renderPanel({
      panel,
      series: allSeries.filter((one) => panel.traces.some((trace) => trace.index === one.trace.index)),
      sweep: doc.sweep,
      markers,
      notes: placed.byPanel.get(panel) ?? [],
      theme,
    })).join('')
    + (layout.readingsBand === null ? '' : renderReadings(readings, dataName, layout.readingsBand, theme))
    + (layout.sourceBand === null ? '' : renderLines(listing, layout.sourceBand, theme, theme.palette.caption));

  const svg = renderDocument(layout, body, { theme, width: style.width, stamp: style.stamp });

  const reported = attachSourceText(byLine([...parsed.errors, ...said]), source);
  const at = (list: readonly FenceError[]): readonly FenceError[] => shiftErrors(list, options.offset ?? 0);
  const errors = at(reported.filter((error) => error.notice !== true));
  const notices = at(reported.filter((error) => error.notice === true));
  return {
    svg,
    readings,
    readingLines: readingLinesOf(readings, dataName),
    errors,
    notices,
    errorHtml: renderErrorBanner(style.debug ? [...errors, ...notices] : errors),
  };
}


/** 読み値を字の行に (CLI・playground)。**図の帯と同じ見出し**。 */
function readingLinesOf(readings: Readings, dataName: string | null): readonly string[] {
  if (readings.rows.length === 0 && readings.extra.length === 0) return [];
  return [
    ...(readings.rows.length > 0 ? [readingsHeading(readings, dataName), ...tableLines([readings.columns, ...readings.rows])] : []),
    ...readings.extra,
  ];
}

export { extractVnaFences } from './fences.ts';
export type { FenceBlock } from './fences.ts';
export type { FenceError } from './types.ts';
export type { Readings } from './model/readings.ts';
export { errorText } from './render/errorText.ts';
export { STAMP_TEXT, VERSION } from './version.ts';
export { problemsOf } from './problems.ts';
