import { normalizeNewlines } from 'fence-kit';
import { attachSourceText, safeToken } from './errors.ts';
import { parseFence } from './parser/parseFence.ts';
import { renderErrorBanner, renderErrorCard } from './render/errorHtml.ts';
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
 * **Phase 0 はまだ図を組まない。** 盤面と番地は Phase 1 で入る
 * (52 の docs/05)。ここで返せるのは、読めたかどうかの報告だけ。
 */
export function renderPerfboard(input: string): RenderResult {
  // 外から来た字は、読む前に改行を揃える。行数は変わらないので行番号はそのまま。
  const source = normalizeNewlines(input);
  const parsed = parseFence(source);

  if (!parsed.doc) {
    const errors = attachSourceText(parsed.errors, source);
    return { svg: '', errors, notices: [], errorHtml: renderErrorCard(errors) };
  }

  // 読めたが、まだ描くものが無い。**黙って空を返さない** — 何も出ないときに
  // 「拡張が壊れている」のか「これから作る」のかが読み手に分かる必要がある。
  //
  // ただし**お知らせであってエラーではない**。読めたフェンスを
  // 「読めませんでした」のカードで返すと、`errors.length` を見る側
  // (CLI の終了コード、帯かカードかの選び分け) が正しい入力を壊れ扱いする。
  const pending: FenceError = {
    message: `盤面 ${safeToken(parsed.doc.board)} はまだ描けません (作りかけのパッケージです)`,
    line: null,
    notice: true,
  };

  const errors = attachSourceText(parsed.errors, source);
  const notices = [pending];
  return { svg: '', errors, notices, errorHtml: renderErrorBanner([...errors, ...notices]) };
}

export { extractPerfboardFences } from './fences.ts';
export type { FenceBlock } from './fences.ts';
export type { FenceError } from './types.ts';
