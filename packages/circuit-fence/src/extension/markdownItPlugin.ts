import type { MarkdownIt, RendererRule } from 'markdown-it';
import {
  applyNotes, compileCircuit, recolorSvg, renderErrorBanner, renderErrorCard, renderNetlist, resizeSvg,
  shiftErrors,
} from '../core/index.ts';
import type { FenceError, Theme } from '../core/index.ts';
import { hashOf } from '../host/hash.ts';

const LANGUAGE = 'circuit';

/** 描けた図の置き場。**同期で**引ける形だけをプラグインに渡す。 */
export type FigureSource = {
  readonly lookup: (hash: string) => { readonly svg: string } | { readonly errors: readonly FenceError[] } | undefined;
  readonly enqueue: (hash: string, tex: string, lineMap: ReadonlyMap<number, number>) => void;
};

const PENDING = '<p class="circuit-pending">図を描いています…</p>';

/**
 * ```circuit フェンスを図に差し替える markdown-it プラグイン。
 *
 * この差し替えは**完全に同期**でなければならない (VS Code は戻り値の HTML を
 * そのまま使う)。TeX → SVG は 1 秒ほどかかる非同期処理なので、ここでは描かず、
 * 描けていれば置き場から引き、無ければ描く順番に積んで「描いています」を返す。
 * 描き終わるとプレビューが描き直され、2 度目のここで図が出る。
 *
 * VS Code のプレビューは返した HTML をサニタイズしないので、
 * 文字列の組み立ては core 側のエスケープを通ったものだけを使う。
 */
export const circuitPlugin =
  (figures: FigureSource) =>
  (md: MarkdownIt): MarkdownIt => {
    const fallback: RendererRule =
      md.renderer.rules.fence ?? ((tokens, index, options, _env, self) => self.renderToken(tokens, index, options));

    md.renderer.rules.fence = (tokens, index, options, env, self) => {
      const token = tokens[index];
      if (!token || token.info.trim().split(/\s+/)[0] !== LANGUAGE) {
        return fallback(tokens, index, options, env, self);
      }

      // VS Code が付けた data-line / code-line を残したままクラスを足す
      // (消すとエディタとプレビューのスクロール同期が切れる)。
      token.attrJoin('class', LANGUAGE);

      // core が返す行番号はフェンスの中の数え方。書き手が直しに行くのは
      // Markdown の行なので、フェンスが始まる位置ぶんずらして出す。
      const offset = token.map === null ? 0 : token.map[0] + 1;
      const { html, theme } = bodyOf(token.content, figures, offset);

      // 地の色をエディタに合わせるのは CSS の仕事なので、その目印を付ける
      // (テーマや地の色を書いてある図は、書いたとおりの色のままにする)。
      if (theme.followsEditor) token.attrJoin('class', 'circuit-auto');

      return `<div${self.renderAttrs(token)}>${html}</div>\n`;
    };

    return md;
  };

/** フェンスの中の行番号を Markdown の行番号へ。 */
function bodyOf(
  source: string,
  figures: FigureSource,
  offset: number,
): { readonly html: string; readonly theme: Theme } {
  // offset はフェンスの ``` が書かれた Markdown の行。エラーの行をずらすのにも、
  // 書き出しに添える行番号にも、同じものを使う (帯と書き出しで数え方を分けない)。
  const { tex, lineMap, netlist, theme, width, notes, errors, notices } = compileCircuit(source, {
    line: offset,
  });
  if (tex === null) return { html: renderErrorCard(shiftErrors(errors, offset)), theme };

  const hash = hashOf(tex);
  const figure = figures.lookup(hash);
  if (figure === undefined) figures.enqueue(hash, tex, lineMap);

  // 図は 1 回描いたものを使い回し、注釈の字と色と大きさだけここで当てる。
  // こうするとテーマを変えても描き直しにいかない。注釈の字を先に差し込むのは、
  // 色を書かなかった注釈をテーマの文字色に乗せるため。
  const drawing =
    figure === undefined
      ? PENDING
      : 'svg' in figure
        ? resizeSvg(recolorSvg(applyNotes(figure.svg, notes), theme), width)
        : '';
  const drawingErrors = figure !== undefined && 'errors' in figure ? figure.errors : [];

  return {
    html:
      drawing +
      renderNetlist(netlist) +
      renderErrorBanner(shiftErrors([...errors, ...drawingErrors, ...notices], offset)),
    theme,
  };
}
