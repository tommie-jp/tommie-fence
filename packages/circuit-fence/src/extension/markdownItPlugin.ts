import type { MarkdownIt, RendererRule } from 'markdown-it';
import {
  attachSourceText, compileCircuit, finishSvg, renderErrorBanner, renderErrorCard, renderNetlist,
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
  const { tex, lineMap, netlist, theme, width, notes, errors, notices, debug } = compileCircuit(source);
  if (tex === null) return { html: renderErrorCard(shiftErrors(errors, offset)), theme };

  const hash = hashOf(tex);
  const figure = figures.lookup(hash);
  if (figure === undefined) figures.enqueue(hash, tex, lineMap);

  // 図は 1 回描いたものを使い回し、注釈の字と色と大きさだけここで当てる
  // (仕上げの順番は core/render/finish.ts が持っている)。こうするとテーマを
  // 変えても描き直しにいかない。
  //
  // 外寸を書かなかった図は**読み手の地の文に合わせる** (注釈の `normal` が
  // 周りの文章と同じ大きさになる)。ここで分かれるのはプレビューだけの都合で、
  // CLI が書き出す SVG は素の大きさ — 貼り先の字の大きさをこちらから
  // 決めるべきではない。
  const drawing =
    figure === undefined
      ? PENDING
      : 'svg' in figure
        ? finishSvg(figure.svg, { notes, theme, width, fitToText: true })
        : '';
  // 描く道から返る行は core を通っていないので、中身はここで添える
  // (compileCircuit が返したものはもう添わっている)。
  const drawingErrors =
    figure !== undefined && 'errors' in figure ? attachSourceText(figure.errors, source) : [];

  return {
    html:
      drawing +
      renderNetlist(netlist) +
      // `debug: off` の図はお知らせを帯に出さない。読めなかった行は残す
      // (黙らせられるのは「描けてはいる」ものだけ)。
      renderErrorBanner(
        shiftErrors([...errors, ...drawingErrors, ...(debug ? notices : [])], offset),
      ),
    theme,
  };
}
