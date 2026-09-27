import { normalizeNewlines } from 'fence-kit';
import { attachSourceText, shiftErrors } from './errors.ts';
import { DIVISIONS, createLayout } from './layout/screen.ts';
import { deviceOf } from './model/device.ts';
import { formatTick } from './model/level.ts';
import { parseFence } from './parser/parseFence.ts';
import { renderDocument } from './render/document.ts';
import { renderErrorBanner } from './render/errorHtml.ts';
import { renderGrid, renderLevelLabels, renderStatus } from './render/grid.ts';
import { resolveStyle } from './render/theme.ts';
import { renderTitle } from './render/title.ts';
import type { FenceError } from './types.ts';

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
  /** それ自体で完結した SVG。**格子は必ず描く** (読めなかった行があっても、読めた所まで)。 */
  readonly svg: string;
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

/** device: が無いときの縦軸 (0〜−100、10 dB/div)。**空でも格子と目盛は描く** (54)。 */
const EMPTY_TICKS = Array.from({ length: DIVISIONS.y + 1 }, (_, index) => formatTick(-10 * index));

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
  const device = doc.device === null ? null : deviceOf(doc.device);
  const status = device === null ? [] : [[{ text: device.label, fill: theme.palette.caption }]];

  const layout = createLayout({ statusRows: 1, title: doc.title, key: null, readings: null, source: null, theme });
  const body = renderTitle(doc.title, layout, theme)
    + renderGrid(layout, theme)
    + renderLevelLabels(EMPTY_TICKS, layout, theme)
    + renderStatus(status, layout, theme);
  const svg = renderDocument(layout, body, { theme, width: style.width, stamp: style.stamp });

  const reported = attachSourceText(byLine([...parsed.errors]), source);
  const at = (list: readonly FenceError[]): readonly FenceError[] => shiftErrors(list, options.offset ?? 0);
  const errors = at(reported.filter((error) => error.notice !== true));
  const notices = at(reported.filter((error) => error.notice === true));
  return {
    svg,
    readingLines: [],
    errors,
    notices,
    errorHtml: renderErrorBanner(style.debug ? [...errors, ...notices] : errors),
  };
}

export { extractSpectrumFences } from './fences.ts';
export type { FenceBlock } from './fences.ts';
export type { FenceError } from './types.ts';
export { errorText } from './render/errorText.ts';
export { STAMP_TEXT, VERSION } from './version.ts';
export { problemsOf } from './problems.ts';
