import { formatSeconds, normalizeNewlines } from 'fence-kit';
import { attachSourceText, shiftErrors } from './errors.ts';
import { createLayout } from './layout/screen.ts';
import type { Readings } from './model/cursors.ts';
import { screenOf } from './model/screen.ts';
import { summaryLines } from './model/summary.ts';
import { parseFence } from './parser/parseFence.ts';
import { renderDocument } from './render/document.ts';
import { renderErrorBanner } from './render/errorHtml.ts';
import { renderAxis, renderGrid, renderStatus, statusText } from './render/grid.ts';
import { renderCursors, renderTrigger } from './render/marks.ts';
import { readingLinesOf, readingsSize, renderReadings } from './render/readings.ts';
import { renderRows } from './render/rows.ts';
import { resolveStyle } from './render/theme.ts';
import { renderTitle } from './render/title.ts';
import type { FenceError } from './types.ts';

/** 行の無いものを先に、あとは行の順に。同じ行なら見つけた順を保つ。 */
const byLine = (errors: readonly FenceError[]): FenceError[] =>
  [...errors].sort((a, b) => (a.line ?? 0) - (b.line ?? 0));

export type RenderResult = {
  /** それ自体で完結した SVG。**格子は必ず描く** (読めなかった行があっても、読めた所まで)。 */
  readonly svg: string;
  /** カーソルの読み値。**エスケープしていない生のデータ**。 */
  readonly readings: Readings;
  /** 読み値と波形の要約を字の行にしたもの (CLI と playground が出す)。 */
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
};

/**
 * フェンスの中身 1 つを図に変換する。DOM も Node も使わない同期の純関数なので、
 * VS Code のプレビュー・CLI・ブラウザのどこからでも同じように呼べる。
 */
export function renderLogic(input: string, options: RenderOptions = {}): RenderResult {
  const source = normalizeNewlines(input);
  const parsed = parseFence(source);
  const { doc } = parsed;
  const style = resolveStyle(doc.style);
  const { theme } = style;
  const screen = screenOf(doc);
  const { window } = screen;

  const trigger = screen.trigger === null ? null : `${screen.trigger.lane} ${screen.trigger.edge === 'rising' ? '↑' : '↓'} ${formatSeconds(screen.trigger.time)}`;
  const status = screen.defaultedWindow
    ? ''
    : statusText({ device: screen.device?.label ?? null, window, sample: screen.sample, trigger });
  const layout = createLayout({
    rows: screen.rows.length,
    labels: screen.rows.map((row) => row.name),
    title: doc.title,
    hasTrigger: screen.trigger !== null,
    hasCursors: screen.cursors.length > 0,
    status,
    readings: readingsSize(screen.readings, theme),
    source: null,
    theme,
  });

  const body = renderTitle(doc.title, layout, theme)
    + renderGrid(layout, theme)
    + (screen.defaultedWindow ? '' : renderAxis(layout, window, theme))
    // 印の縦線は行の下に敷く (バスの値の字に線が重ならないよう、字には縁取りを付けてある)。
    + renderTrigger(screen.trigger, window, layout, theme)
    + renderCursors(screen.cursors, window, layout, theme)
    + renderRows(screen.rows, window, layout, theme)
    + (status === '' ? '' : renderStatus(status, layout, theme))
    + (layout.readingsBand === null ? '' : renderReadings(screen.readings, layout.readingsBand, theme));
  const svg = renderDocument(layout, body, { theme, width: style.width, stamp: style.stamp });

  const reported = attachSourceText(byLine([...parsed.errors, ...screen.said]), source);
  const at = (list: readonly FenceError[]): readonly FenceError[] => shiftErrors(list, options.offset ?? 0);
  const errors = at(reported.filter((error) => error.notice !== true));
  const notices = at(reported.filter((error) => error.notice === true));
  return {
    svg,
    readings: screen.readings,
    readingLines: [...readingLinesOf(screen.readings), ...summaryLines(screen.rows, window)],
    errors,
    notices,
    errorHtml: renderErrorBanner(style.debug ? [...errors, ...notices] : errors),
  };
}

export { extractLogicFences } from './fences.ts';
export type { FenceBlock } from './fences.ts';
export type { FenceError } from './types.ts';
export type { Readings } from './model/cursors.ts';
export { errorText } from './render/errorText.ts';
export { STAMP_TEXT, VERSION } from './version.ts';
export { problemsOf } from './problems.ts';
