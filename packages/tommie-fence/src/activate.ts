import type { MarkdownIt } from 'markdown-it';
import { createRenderQueue } from 'circuit-fence/queue';
import type { TexRenderer } from 'circuit-fence/queue';
import { createPreviewRefresher } from './previewRefresher.ts';
import { allPlugins } from './markdownItPlugin.ts';

export type Wiring = {
  /** TeX を SVG にする人。デスクトップは WASM、web は「描けない」を返すスタブ。 */
  readonly render: TexRenderer;
  /** プレビューに描き直させる頼み先。 */
  readonly refresh: () => void;
};

/**
 * 拡張の組み立て。外の世界に触るもの (描画・プレビューへの指示) は入口から
 * 渡してもらう。ここから下は vscode を知らない。
 *
 * **プレビューは 3 つとも 1 つの `extendMarkdownIt` で登録する** —
 * VS Code は拡張ごとに 1 回しか呼ばない (52 の docs/19)。
 */
export function activateWith(wiring: Wiring) {
  const refresher = createPreviewRefresher(wiring.refresh);
  const queue = createRenderQueue({ render: wiring.render, onDrawn: refresher.request });

  return {
    extendMarkdownIt(md: MarkdownIt): MarkdownIt {
      return allPlugins(queue)(md);
    },
  };
}
