import type { MarkdownIt, RendererRule } from 'markdown-it';
import { renderVna } from './core/index.ts';
import type { DataSource } from './core/index.ts';

const LANGUAGE = 'vna';

/**
 * `data:` のファイルを読む口を、描いている文書ごとに作る。**宿主が決める** —
 * VS Code は markdown-it の `env.currentDocument` に文書の URI を入れて渡す
 * (拡張ホストは Node なので隣のファイルを読める)。web 版と playground は渡さない。
 */
export type DataReader = (env: unknown) => DataSource | undefined;

/**
 * ```vna フェンスを図に差し替える markdown-it プラグイン。
 * VS Code のプレビューはここが返した HTML をサニタイズしないので、
 * 文字列の組み立てはすべて core 側のエスケープを通ったものだけを使う。
 */
export const vnaPlugin = (reader?: DataReader) => (md: MarkdownIt): MarkdownIt => {
  const fallback: RendererRule = md.renderer.rules.fence
    ?? ((tokens, index, options, _env, self) => self.renderToken(tokens, index, options));

  md.renderer.rules.fence = (tokens, index, options, env, self) => {
    const token = tokens[index];
    if (!token || token.info.trim().split(/\s+/)[0] !== LANGUAGE) {
      return fallback(tokens, index, options, env, self);
    }

    // VS Code が付けた data-line / code-line を残したままクラスを足す
    // (消すとエディタとプレビューのスクロール同期が切れる)。
    token.attrJoin('class', 'vna');
    // **行番号は Markdown の行で出す。** core が読むのはフェンスの中の数え方。
    const offset = token.map === null ? 0 : token.map[0] + 1;
    const data = reader?.(env);
    const { svg, errorHtml } = renderVna(token.content, { offset, ...(data === undefined ? {} : { data }) });

    return `<div${self.renderAttrs(token)}>${svg}${errorHtml}</div>\n`;
  };

  return md;
};
