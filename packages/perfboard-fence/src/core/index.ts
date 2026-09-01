import { normalizeNewlines } from 'fence-kit';
import { attachSourceText } from './errors.ts';
import { createLayout } from './model/layout.ts';
import { parseFence } from './parser/parseFence.ts';
import { placeParts } from './placement/place.ts';
import { renderBoard } from './render/board.ts';
import { renderParts } from './render/parts.ts';
import { renderDocument } from './render/document.ts';
import { renderErrorBanner, renderErrorCard } from './render/errorHtml.ts';
import { THEME } from './render/theme.ts';
import type { FenceError } from './types.ts';

/** 行の無いものを先に、あとは行の順に。同じ行なら見つけた順を保つ。 */
const byLine = (errors: readonly FenceError[]): FenceError[] =>
  [...errors].sort((a, b) => (a.line ?? 0) - (b.line ?? 0));

export type RenderResult = {
  /**
   * それ自体で完結した SVG。外部リソースもスクリプトも参照しない。
   * **図が 1 つも組めなかったときは空文字列**で、言うことは `errorHtml` に入る。
   */
  readonly svg: string;
  /** 読めなかったところ。行番号と、行の中身と、綴りを指す印を持つ。 */
  readonly errors: readonly FenceError[];
  /** 読めてはいるが、思ったとおりには出ないところ。 */
  readonly notices: readonly FenceError[];
  /**
   * 図の下に貼る帯 (図は描けた) か、カード (読めなかった) の HTML。
   * 言うことが無ければ空文字列。**図の SVG には何も書き込まない**ので、
   * 書き出した SVG を貼ったときに報告が付いてこない。
   */
  readonly errorHtml: string;
};

/**
 * フェンスの中身 1 つを図に変換する。DOM も Node も使わない同期の純関数なので、
 * VS Code のプレビュー・CLI・サーバー側描画のどこからでも同じように呼べる。
 *
 * **Phase 2 で描けるのは板・穴・2 本足の部品まで。** 配線とネットリストは
 * Phase 3、ERC は Phase 4 で入る (52 の docs/05)。
 */
export function renderPerfboard(input: string): RenderResult {
  // 外から来た字は、読む前に改行を揃える。行数は変わらないので行番号はそのまま。
  const source = normalizeNewlines(input);
  const parsed = parseFence(source);

  if (!parsed.doc) {
    const errors = attachSourceText(parsed.errors, source);
    return { svg: '', errors, notices: [], errorHtml: renderErrorCard(errors) };
  }

  const { board } = parsed.doc;
  const layout = createLayout(board);
  const placement = placeParts(parsed.doc.parts, board);
  const svg = renderDocument(
    layout,
    renderBoard(board, layout, THEME) + renderParts(placement.parts, layout, THEME),
  );

  // **行順に並べる。** 段ごとに集めた順のままだと、帯の打ち切り (8 件) で
  // 後ろの段の報告から先に消え、行を追って直せなくなる。
  const reported = attachSourceText(byLine([...parsed.errors, ...placement.errors]), source);
  const errors = reported.filter((error) => error.notice !== true);
  const notices = reported.filter((error) => error.notice === true);
  return { svg, errors, notices, errorHtml: renderErrorBanner(reported) };
}

export { extractPerfboardFences } from './fences.ts';
export type { FenceBlock } from './fences.ts';
export type { FenceError } from './types.ts';
export { VERSION } from './version.ts';
