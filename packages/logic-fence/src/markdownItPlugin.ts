import type { MarkdownIt, RendererRule } from 'markdown-it';
import { renderLogic } from './core/index.ts';

const LANGUAGE = 'logic';

/**
 * ```logic フェンスを図に差し替える markdown-it プラグイン。
 * VS Code のプレビューはここが返した HTML をサニタイズしないので、
 * 文字列の組み立てはすべて core 側のエスケープを通ったものだけを使う。
 */
export const logicPlugin = () => (md: MarkdownIt): MarkdownIt => {
  const fallback: RendererRule = md.renderer.rules.fence
    ?? ((tokens, index, options, _env, self) => self.renderToken(tokens, index, options));

  md.renderer.rules.fence = (tokens, index, options, env, self) => {
    const token = tokens[index];
    if (!token || token.info.trim().split(/\s+/)[0] !== LANGUAGE) {
      return fallback(tokens, index, options, env, self);
    }

    // VS Code が付けた data-line / code-line を残したままクラスを足す
    // (消すとエディタとプレビューのスクロール同期が切れる)。
    token.attrJoin('class', 'logic');
    // **行番号は Markdown の行で出す。** core が読むのはフェンスの中の数え方。
    const offset = token.map === null ? 0 : token.map[0] + 1;
    const { svg, errorHtml } = renderLogic(token.content, { offset });

    return `<div${self.renderAttrs(token)}>${svg}${errorHtml}</div>\n`;
  };

  return md;
};
