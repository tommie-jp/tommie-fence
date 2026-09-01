import { normalizeNewlines } from 'fence-kit';
import { attachSourceText } from './errors.ts';
import { createLayout } from './model/layout.ts';
import { parseFence } from './parser/parseFence.ts';
import { renderBoard } from './render/board.ts';
import { renderDocument } from './render/document.ts';
import { renderErrorBanner, renderErrorCard } from './render/errorHtml.ts';
import { THEME } from './render/theme.ts';
import type { FenceError } from './types.ts';

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
 * **Phase 1 で描けるのは板と穴まで。** 部品は Phase 2、配線とネットリストは
 * Phase 3 で入る (52 の docs/05)。
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
  const svg = renderDocument(layout, renderBoard(board, layout, THEME));

  const errors = attachSourceText(parsed.errors, source);
  return { svg, errors, notices: [], errorHtml: renderErrorBanner(errors) };
}

export { extractPerfboardFences } from './fences.ts';
export type { FenceBlock } from './fences.ts';
export type { FenceError } from './types.ts';
export { VERSION } from './version.ts';
