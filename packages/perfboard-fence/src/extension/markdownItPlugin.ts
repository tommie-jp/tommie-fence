import type { MarkdownIt, RendererRule } from 'markdown-it';
import { renderPerfboard } from '../core/index.ts';

const LANGUAGE = 'perfboard';

/**
 * ```perfboard フェンスを図に差し替える markdown-it プラグイン。
 * VS Code のプレビューはここが返した HTML をサニタイズしないので、
 * 文字列の組み立てはすべて core 側のエスケープを通ったものだけを使う。
 */
export function perfboardPlugin(md: MarkdownIt): MarkdownIt {
  const fallback: RendererRule = md.renderer.rules.fence
    ?? ((tokens, index, options, _env, self) => self.renderToken(tokens, index, options));

  md.renderer.rules.fence = (tokens, index, options, env, self) => {
    const token = tokens[index];
    if (!token || token.info.trim().split(/\s+/)[0] !== LANGUAGE) {
      return fallback(tokens, index, options, env, self);
    }

    // VS Code が付けた data-line / code-line を残したままクラスを足す
    // (消すとエディタとプレビューのスクロール同期が切れる)。
    token.attrJoin('class', 'perfboard');
    // 図は SVG、読めなかったところは図の外の HTML。字は core 側でエスケープ済み。
    const { svg, errorHtml } = renderPerfboard(token.content);

    return `<div${self.renderAttrs(token)}>${svg}${errorHtml}</div>\n`;
  };

  return md;
}
