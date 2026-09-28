import { attachSourceText, shiftErrors } from './errors.ts';
import type { Readings } from './model/readings.ts';
import { renderErrorBanner } from './render/errorHtml.ts';
import type { FenceError } from './types.ts';

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

/** 行の無いものを先に、あとは行の順に。同じ行なら見つけた順を保つ。 */
const byLine = (errors: readonly FenceError[]): FenceError[] =>
  [...errors].sort((a, b) => (a.line ?? 0) - (b.line ?? 0));

/**
 * 描いた図と言うことを結果に畳む (時間の画面と XY の共通の出口)。言うことには行の中身と
 * 印を添え、行番号を Markdown の行へずらし、読めなかった物とお知らせに分ける。
 */
export function finishResult(input: {
  readonly source: string;
  readonly said: readonly FenceError[];
  readonly svg: string;
  readonly readings: Readings;
  readonly readingLines: readonly string[];
  readonly debug: boolean;
  readonly offset: number;
}): RenderResult {
  const reported = attachSourceText(byLine(input.said), input.source);
  const at = (list: readonly FenceError[]): readonly FenceError[] => shiftErrors(list, input.offset);
  const errors = at(reported.filter((error) => error.notice !== true));
  const notices = at(reported.filter((error) => error.notice === true));
  return {
    svg: input.svg,
    readings: input.readings,
    readingLines: input.readingLines,
    errors,
    notices,
    errorHtml: renderErrorBanner(input.debug ? [...errors, ...notices] : errors),
  };
}
