import { formatHertzShort, normalizeNewlines } from 'fence-kit';
import { attachSourceText, notice, shiftErrors } from './errors.ts';
import { frequencyTicks, levelTicks } from './layout/scales.ts';
import type { Axes } from './layout/scales.ts';
import { DIVISIONS, SIZE, createLayout } from './layout/screen.ts';
import { readData } from './model/data.ts';
import type { DataSource } from './model/data.ts';
import { deviceOf } from './model/device.ts';
import { headroomNotice } from './model/headroom.ts';
import { markerPoint, peakPoint, readMarkers } from './model/markers.ts';
import type { MarkerSpec, Readings } from './model/markers.ts';
import { screenOf } from './model/screen.ts';
import type { Screen } from './model/screen.ts';
import type { Point } from './model/trace.ts';
import { parseFence } from './parser/parseFence.ts';
import { renderDocument } from './render/document.ts';
import { renderErrorBanner } from './render/errorHtml.ts';
import { renderFrequencyLabels, renderGrid, renderLevelLabels, renderStatus, statusLines } from './render/grid.ts';
import type { StatusItem } from './render/grid.ts';
import { keyText, readingLinesOf, readingsSize, renderKey, renderReadings } from './render/readings.ts';
import { renderTrace, renderMarker } from './render/trace.ts';
import { resolveStyle, traceColor } from './render/theme.ts';
import { renderTitle } from './render/title.ts';
import type { FenceDocument, FenceError } from './types.ts';

/** 行の無いものを先に、あとは行の順に。同じ行なら見つけた順を保つ。 */
const byLine = (errors: readonly FenceError[]): FenceError[] =>
  [...errors].sort((a, b) => (a.line ?? 0) - (b.line ?? 0));

/**
 * `data:` のファイルを読む口。**core はファイルを開かない** — 開くのは宿主
 * (CLI は `.md` の隣、拡張は開いている文書の隣)。名前は core が `DATA_NAME` で
 * 絞ったものだけが来る。見つからなければ null。
 */
export type { DataSource } from './model/data.ts';

export type RenderResult = {
  /** それ自体で完結した SVG。**格子は必ず描く** (読めなかった行があっても、読めた所まで)。 */
  readonly svg: string;
  /** マーカーの読み値。**エスケープしていない生のデータ**。 */
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

/** device: が無いときの画面 (0〜−100、10 dB/div、横の字無し)。**空でも格子と目盛は描く** (54)。 */
const EMPTY_AXES: Axes = { start: 0, stop: 1, ref: 0, scale: 10, unit: 'dBm' };

type Drawn = {
  readonly axes: Axes;
  readonly points: readonly Point[];
  /** 測った点 (`data:`)。読めなければ空。 */
  readonly measured: readonly Point[];
  readonly dataName: string | null;
  readonly markers: readonly MarkerSpec[];
  readonly status: readonly [readonly string[], readonly string[]] | null;
  readonly readings: Readings;
  readonly said: readonly FenceError[];
};

/** マーカーのうち掃引の中の物。外の物は言って外す。 */
function markersInside(markers: readonly MarkerSpec[], screen: Screen, said: FenceError[]): readonly MarkerSpec[] {
  return markers.filter((marker) => {
    if (marker.kind === 'peak' || (marker.f >= screen.start && marker.f <= screen.stop)) return true;
    said.push(notice(`マーカー ${formatHertzShort(marker.f)} は掃引 (${formatHertzShort(screen.start)}〜${formatHertzShort(screen.stop)}) の外です (描いていません)`, marker.line));
    return false;
  });
}

function drawnOf(doc: FenceDocument, source: DataSource | undefined): Drawn {
  if (doc.device === null) {
    return {
      axes: EMPTY_AXES, points: [], measured: [], dataName: null, markers: [], status: null, readings: { rows: [], basis: null }, said: [],
    };
  }
  const screen = screenOf(doc, deviceOf(doc.device));
  const measured = readData(doc, screen, source);
  // **山は実測があれば実測**、無ければ理想。信号が無い (フロアだけの) 画面では言わない。
  const traced = measured.points.length > 0 ? measured.points : doc.signal.length > 0 ? screen.points : [];
  const headroom = headroomNotice({ peak: peakPoint(traced), ref: screen.ref, scale: screen.scale, unit: screen.unit, line: doc.ref?.line ?? null });
  const said = [...screen.errors, ...screen.said, ...measured.said, ...(headroom === null ? [] : [headroom])];
  const markers = markersInside(doc.markers, screen, said);
  const axes: Axes = { start: screen.start, stop: screen.stop, ref: screen.ref, scale: screen.scale, unit: screen.unit };
  // **読み値は実測があれば実測** (実機のマーカーは測った点を読む)、無ければ理想。
  const readings = measured.points.length > 0
    ? readMarkers(markers, measured.points, screen.unit, 'data')
    : readMarkers(markers, screen.points, screen.unit, screen.points.length === 0 ? null : 'model');
  return {
    axes, points: screen.points, measured: measured.points, dataName: measured.points.length > 0 ? measured.name : null,
    markers, status: screen.status, readings, said,
  };
}

/**
 * フェンスの中身 1 つを図に変換する。DOM も Node も使わない同期の純関数なので、
 * VS Code のプレビュー・CLI・ブラウザのどこからでも同じように呼べる。
 */
export function renderSpectrum(input: string, options: RenderOptions = {}): RenderResult {
  const source = normalizeNewlines(input);
  const parsed = parseFence(source);
  const { doc } = parsed;
  const style = resolveStyle(doc.style);
  const { theme } = style;
  const drawn = drawnOf(doc, options.data);
  const color = traceColor(theme, 0);
  const hasModel = drawn.points.length > 0;

  const items = (texts: readonly string[] | undefined): readonly StatusItem[] =>
    (texts ?? []).map((text) => ({ text, fill: theme.palette.caption }));
  const first = items(drawn.status?.[0]);
  const status = drawn.status === null ? [] : statusLines([...first, ...items(drawn.status[1])], first.length, SIZE.divX * DIVISIONS.x, theme);
  const layout = createLayout({
    statusRows: Math.max(1, status.length),
    title: doc.title,
    key: keyText(hasModel, drawn.dataName),
    readings: readingsSize(drawn.readings, drawn.dataName, theme),
    source: null,
    theme,
  });
  const markerSvg = drawn.markers.map((marker, index) => {
    const point = markerPoint(marker, drawn.measured.length > 0 ? drawn.measured : drawn.points);
    return point === null ? '' : renderMarker(point, `${index + 1}`, drawn.axes, layout.grid, color, theme);
  }).join('');

  const body = renderTitle(doc.title, layout, theme)
    + renderKey(hasModel, drawn.dataName, layout, theme)
    + renderGrid(layout, theme)
    + renderLevelLabels(levelTicks(drawn.axes), layout, theme)
    + renderFrequencyLabels(drawn.status === null ? null : frequencyTicks(drawn.axes), layout, theme)
    + renderTrace(drawn.points, 'model', drawn.axes, layout.grid, color, drawn.measured.length > 0)
    + renderTrace(drawn.measured, 'data', drawn.axes, layout.grid, color)
    + markerSvg
    + renderStatus(status, layout, theme)
    + (layout.readingsBand === null ? '' : renderReadings(drawn.readings, drawn.dataName, layout.readingsBand, theme));
  const svg = renderDocument(layout, body, { theme, width: style.width, stamp: style.stamp });

  const reported = attachSourceText(byLine([...parsed.errors, ...drawn.said]), source);
  const at = (list: readonly FenceError[]): readonly FenceError[] => shiftErrors(list, options.offset ?? 0);
  const errors = at(reported.filter((error) => error.notice !== true));
  const notices = at(reported.filter((error) => error.notice === true));
  return {
    svg,
    readings: drawn.readings,
    readingLines: readingLinesOf(drawn.readings, drawn.dataName),
    errors,
    notices,
    errorHtml: renderErrorBanner(style.debug ? [...errors, ...notices] : errors),
  };
}

export { extractSpectrumFences } from './fences.ts';
export type { FenceBlock } from './fences.ts';
export type { FenceError } from './types.ts';
export type { Readings } from './model/markers.ts';
export { errorText } from './render/errorText.ts';
export { STAMP_TEXT, VERSION } from './version.ts';
export { problemsOf } from './problems.ts';
