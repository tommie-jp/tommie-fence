import { normalizeNewlines, textWidth } from 'fence-kit';
import { attachSourceText, fenceError, notice, shiftErrors } from './errors.ts';
import { linearAxis, logAxis, startsAtZero } from './layout/axis.ts';
import type { Axis } from './layout/axis.ts';
import { SIZE, createLayout } from './layout/page.ts';
import { LIMITS } from './limits.ts';
import { parseCsv } from './model/csv.ts';
import { matchColumns } from './model/data.ts';
import { isMeasured, peakOf, sampleLine } from './model/lines.ts';
import type { LineSpec, Point } from './model/lines.ts';
import { PREFIXES, formatReading } from './model/quantity.ts';
import { readingsOf } from './model/readings.ts';
import type { Readings } from './model/readings.ts';
import { DEFAULT_X, parseFence } from './parser/parseFence.ts';
import { axisLabel, renderAxisName, renderFrame, renderXTicks, renderYTicks } from './render/axes.ts';
import { renderDocument } from './render/document.ts';
import { renderErrorBanner } from './render/errorHtml.ts';
import { linesSize, renderLines, sourceListing } from './render/mono.ts';
import { renderBand, renderIdeal, renderLevel, renderMark, renderMarkLabels, renderMeasured, renderNoteText, renderPeak } from './render/plot.ts';
import { legendRows, readingLinesOf, readingsSize, renderLegend, renderReadings } from './render/readings.ts';
import type { LegendItem } from './render/readings.ts';
import { lineColor, resolveStyle } from './render/theme.ts';
import { renderTitle } from './render/title.ts';
import type { AxisSpec, FenceDocument, FenceError, NoteSpec } from './types.ts';

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
  /** 読み値 (mark と peak)。**エスケープしていない生のデータ**。 */
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

type Measured = { readonly lines: readonly LineSpec[]; readonly said: readonly FenceError[] };

/** `data:` を読む。**読めなくても図は出す** (言うことはお知らせ)。 */
function readData(doc: FenceDocument, xUnit: string, source: DataSource | undefined): Measured {
  if (doc.data === null) return { lines: [], said: [] };
  const { name, line } = doc.data;
  if (source === undefined) {
    return { lines: [], said: [notice(`この宿主では ${name} を読めません (CLI か VS Code の拡張で描くと実測が重なります)`, line, name)] };
  }
  let text: string | null;
  try {
    text = source(name);
  } catch {
    text = null;
  }
  if (text === null) return { lines: [], said: [notice(`${name} が見つかりません (.md と同じ場所に置きます)`, line, name)] };
  const read = parseCsv(text, xUnit);
  if (!read.ok) return { lines: [], said: [notice(`${name} を読めません: ${read.reason}`, line, name)] };
  // **1 列の点は pointsPerLine まで** — 1 MB の CSV で ○ を 10 万個描かせない。等間隔に間引いて言う。
  const thinned: string[] = [];
  const columns = read.columns.map((column) => {
    if (column.points.length <= LIMITS.pointsPerLine) return column;
    const step = column.points.length / LIMITS.pointsPerLine;
    thinned.push(`${column.name} の列は ${column.points.length} 点あるので、${LIMITS.pointsPerLine} 点に間引いて描いています`);
    return { ...column, points: Array.from({ length: LIMITS.pointsPerLine }, (_, index) => column.points[Math.floor(index * step)]).filter((point) => point !== undefined) };
  });
  const matched = matchColumns(columns, doc.lines, doc.y[0]?.unit ?? '');
  return {
    lines: matched.lines,
    said: [...read.notes, ...thinned, ...matched.said].map((one) => notice(`${name}: ${one}`, line, name)),
  };
}

/** 横軸。**式は範囲が無いと描けない** (どこからどこまで計算するかが決まらない)。 */
function xAxisOf(spec: AxisSpec, lines: readonly LineSpec[], notes: readonly NoteSpec[], said: FenceError[]): Axis {
  const values = [
    ...lines.flatMap((line) => (line.source.kind === 'expr' ? [] : line.source.points.map((point) => point.x))),
    ...notes.flatMap((note) => (note.kind === 'mark' ? [note.x] : note.kind === 'band' ? [note.from, note.to] : [])),
  ].filter((value) => !spec.log || value > 0);
  if (spec.range === null && values.length === 0 && lines.some((line) => line.source.kind === 'expr')) {
    said.push(fenceError(`式だけの図は x: に範囲を書きます (x: ${spec.name === null ? '' : `${spec.name} `}${spec.unit}${spec.log ? ' log' : ''} 2k..32k のように)`, spec.line));
  }
  const range = spec.range ?? (values.length === 0 ? (spec.log ? [1, 10] as const : [0, 1] as const) : null);
  if (spec.log) return logAxis(values, range);
  // 横軸は値を包むだけ (0 から始めない — 始めるのは縦の大きさの量)。値が 1 つなら幅を持たせる。
  const low = Math.min(...values);
  const high = Math.max(...values);
  const pad = low === high ? (low === 0 ? 1 : Math.abs(low) / 2) : 0;
  return linearAxis(values, range ?? [low - pad, high + pad], spec.unit, false);
}

/** 枠 1 つ (単位ごと)。 */
type Panel = {
  readonly unit: string;
  readonly spec: AxisSpec | null;
  readonly lines: readonly LineSpec[];
  readonly notes: readonly NoteSpec[];
};

/** 単位ごとに枠へ分ける。**線の書いた順に、初めて出た単位の順** (vna と同じ)。 */
function panelsOf(doc: FenceDocument, lines: readonly LineSpec[], said: FenceError[]): { readonly panels: readonly Panel[]; readonly drawn: readonly LineSpec[] } {
  const units: string[] = [];
  for (const line of lines) if (!units.includes(line.unit)) units.push(line.unit);
  if (units.length === 0) units.push(...doc.y.map((axis) => axis.unit).slice(0, 1));
  if (units.length === 0) units.push('');
  for (const axis of doc.y) {
    if (!units.includes(axis.unit)) said.push(notice(`y: の ${axis.unit} を使う線がありません (線のキーの最後の語が単位です)`, axis.line, axis.unit));
  }
  const kept = units.slice(0, LIMITS.panels);
  const dropped = lines.filter((line) => !kept.includes(line.unit));
  if (dropped.length > 0) {
    said.push(fenceError(`単位ごとの枠は ${LIMITS.panels} つまでです (${[...new Set(dropped.map((line) => line.unit))].join(' / ')} の線は描いていません)`, dropped[0]?.line ?? null));
  }
  const drawn = lines.filter((line) => kept.includes(line.unit));

  // 注釈を枠に振る。y を持つ物は単位で、単位が無ければ枠が 1 つのときだけ。
  const placed = new Map<NoteSpec, string>();
  for (const note of doc.notes) {
    if (note.kind !== 'level' && note.kind !== 'text') continue;
    const unit = note.unit === '°' ? 'deg' : note.unit;
    // 接頭辞だけ違う単位 (`500mV` を V の枠に) は値を直して載せる。
    const prefixed = unit === null ? undefined : kept.find((one) => unit.length === one.length + 1 && unit.endsWith(one) && Object.hasOwn(PREFIXES, unit[0] ?? ''));
    const target = unit === null ? (kept.length === 1 ? kept[0] : undefined) : kept.find((one) => one === unit) ?? prefixed;
    if (target === undefined) {
      const names = kept.join(' / ');
      said.push(fenceError(
        unit === null ? `${note.kind} の値に単位を付けます (枠が ${names} と複数あるため)` : `${unit} の枠がありません (線の単位は ${names})`,
        note.line, unit ?? undefined,
      ));
      continue;
    }
    const factor = unit !== null && target !== unit ? (PREFIXES[unit[0] ?? ''] ?? 1) : 1;
    placed.set(factor === 1 ? note : { ...note, y: note.y * factor } as NoteSpec, target);
  }
  const panels = kept.map((unit): Panel => ({
    unit,
    spec: doc.y.find((axis) => axis.unit === unit) ?? null,
    lines: drawn.filter((line) => line.unit === unit),
    notes: [...placed].filter(([, one]) => one === unit).map(([note]) => note),
  }));
  return { panels, drawn };
}

/** 縦軸。書いた y: が先、無ければ値 (と水準・字) から。 */
function yAxisOf(panel: Panel, sampled: ReadonlyMap<LineSpec, readonly Point[]>, said: FenceError[]): Axis {
  const log = panel.spec?.log ?? false;
  const values = [
    ...panel.lines.flatMap((line) => (sampled.get(line) ?? []).map((point) => point.y)),
    ...panel.notes.flatMap((note) => (note.kind === 'level' || note.kind === 'text' ? [note.y] : [])),
  ];
  if (log) {
    const dropped = values.filter((value) => value <= 0).length;
    if (dropped > 0 && panel.spec !== null) said.push(notice(`${panel.unit} の枠は対数なので、0 以下の値 (${dropped} 点) は描いていません`, panel.spec.line));
    return logAxis(values, panel.spec?.range ?? null);
  }
  return linearAxis(values, panel.spec?.range ?? null, panel.unit, startsAtZero(panel.unit));
}

/**
 * フェンスの中身 1 つを図に変換する。DOM も Node も使わない同期の純関数なので、
 * VS Code のプレビュー・CLI・ブラウザのどこからでも同じように呼べる。
 */
export function renderGraph(input: string, options: RenderOptions = {}): RenderResult {
  const source = normalizeNewlines(input);
  const parsed = parseFence(source);
  const { doc } = parsed;
  const style = resolveStyle(doc.style);
  const { theme } = style;
  const said: FenceError[] = [];

  const xSpec = doc.x ?? DEFAULT_X;
  if (!doc.keys.includes('x') && source.trim() !== '') {
    said.push(notice('x: が無いので x 0..1 で描いています (x: 周波数 Hz log 2k..32k のように書きます)', null));
  }
  if (!doc.keys.includes('lines') && doc.data === null && source.trim() !== '') {
    said.push(notice('lines: が無いので枠だけ描いています (lines: の下に「名前 単位: 式」を書きます)', null));
  }
  const measured = readData(doc, xSpec.unit, options.data);
  said.push(...measured.said);
  const { panels, drawn } = panelsOf(doc, [...doc.lines, ...measured.lines], said);
  const xAxis = xAxisOf(xSpec, drawn, doc.notes, said);
  if (xAxis.log) {
    for (const line of drawn) {
      const dropped = line.source.kind === 'expr' ? 0 : line.source.points.filter((point) => point.x <= 0).length;
      if (dropped > 0) said.push(notice(`横軸は対数なので、${line.name} の x ≤ 0 の点 (${dropped} 点) は描いていません`, line.line ?? xSpec.line, line.name));
    }
  }
  const sampled = new Map<LineSpec, readonly Point[]>(drawn.map((line) => [line, sampleLine(line, { min: xAxis.min, max: xAxis.max, log: xAxis.log })]));
  for (const line of drawn) {
    if (line.source.kind === 'expr' && (sampled.get(line) ?? []).length === 0) {
      said.push(notice(`${line.name} の式は x の範囲の中で値を持ちません (描いていません)`, line.line, line.name));
    }
  }
  const yAxes = panels.map((panel) => yAxisOf(panel, sampled, said));

  const marks = doc.notes.flatMap((note) => (note.kind === 'mark' ? [note.x] : [])).slice(0, LIMITS.marks);
  const readings = readingsOf({
    lines: drawn, sampled, marks, peak: doc.notes.some((note) => note.kind === 'peak'),
    xName: xSpec.name ?? 'x', xUnit: xSpec.unit, xLog: xAxis.log,
  });
  const dataName = doc.data?.name ?? null;

  // 凡例: 線の名前と見本 (理想は破線、実測は ○)。
  const legendItems: LegendItem[] = drawn.map((line) => ({
    name: isMeasured(line) && drawn.some((other) => !isMeasured(other) && other.index === line.index) ? `${line.name} (実測)` : line.name,
    color: lineColor(theme, line.index),
    measured: isMeasured(line),
  }));
  const rows = legendRows(legendItems, SIZE.plotWidth, theme);
  const listing = doc.notes.some((note) => note.kind === 'source') ? sourceListing(source) : null;
  const layout = createLayout({
    title: doc.title,
    legendRows: rows.length,
    panels: panels.length,
    readings: readingsSize(readings, dataName, theme),
    source: listing === null ? null : linesSize(listing, theme),
    theme,
  });

  const bands = doc.notes.flatMap((note) => (note.kind === 'band' ? [note] : []));
  const panelSvg = panels.map((panel, index) => {
    const box = layout.panels[index];
    const yAxis = yAxes[index];
    if (box === undefined || yAxis === undefined) return '';
    const rect = box.plot;
    const top = index === 0;
    const bottomPanel = index === panels.length - 1;
    const name = axisLabel(panel.spec?.name ?? null, panel.unit, yAxis.log);
    const nameLeft = rect.x - SIZE.marginLeft + 4;
    const heading = renderAxisName(name, nameLeft, box.headingBaseline, 'start', theme);
    const markLabels = top
      ? renderMarkLabels(marks.map((x) => ({ x, text: formatReading(x, xSpec.unit) })), xAxis, rect, box.headingBaseline,
        nameLeft + textWidth(name) * theme.metrics.textSize + 6, theme)
      : '';
    const lines = panel.lines.map((line) => {
      const points = sampled.get(line) ?? [];
      const color = lineColor(theme, line.index);
      return isMeasured(line) ? renderMeasured(points, xAxis, yAxis, rect, color) : renderIdeal(points, xAxis, yAxis, rect, color);
    }).join('');
    const levels = panel.notes.map((note) => (note.kind === 'level'
      ? renderLevel(note.y, formatReading(note.y, panel.unit), yAxis, rect, theme)
      : '')).join('');
    const texts = panel.notes.map((note) => (note.kind === 'text'
      ? renderNoteText(note.x, note.y, note.text, xAxis, yAxis, rect, theme)
      : '')).join('');
    const peaks = doc.notes.some((note) => note.kind === 'peak')
      ? panel.lines.map((line) => {
        const top = peakOf(sampled.get(line) ?? []);
        return top === null ? '' : renderPeak(top, formatReading(top.y, line.unit), xAxis, yAxis, rect, lineColor(theme, line.index), theme);
      }).join('')
      : '';
    return renderFrame(xAxis, yAxis, rect, theme)
      + bands.map((band) => renderBand(band.from, band.to, band.text, xAxis, rect, theme, bottomPanel)).join('')
      + lines
      + levels
      + marks.map((x) => renderMark(x, xAxis, rect, theme)).join('')
      + peaks
      + texts
      + renderYTicks(yAxis, panel.unit, rect, theme)
      + heading
      + markLabels;
  }).join('');
  const bottom = layout.panels[layout.panels.length - 1]?.plot;
  const xLabels = bottom === undefined
    ? ''
    : renderXTicks(xAxis, xSpec.unit, bottom, layout.xTickBaseline, theme)
      + renderAxisName(axisLabel(xSpec.name, xSpec.unit, xAxis.log), bottom.x + bottom.width / 2, layout.xLabelBaseline, 'middle', theme);

  const body = renderTitle(doc.title, layout, theme)
    + renderLegend(rows, layout.legendRows, (bottom?.x ?? 0), theme)
    + panelSvg
    + xLabels
    + (layout.readingsBand === null ? '' : renderReadings(readings, dataName, layout.readingsBand, theme))
    + (layout.sourceBand === null || listing === null ? '' : renderLines(listing, layout.sourceBand, theme, theme.palette.label));
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

export { extractGraphFences } from './fences.ts';
export type { FenceBlock } from './fences.ts';
export type { FenceError } from './types.ts';
export type { Readings } from './model/readings.ts';
export { errorText } from './render/errorText.ts';
export { STAMP_TEXT, VERSION } from './version.ts';
export { problemsOf } from './problems.ts';
