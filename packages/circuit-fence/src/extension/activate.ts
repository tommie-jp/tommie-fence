import type { MarkdownIt } from 'markdown-it';
import { createRenderQueue } from '../host/renderQueue.ts';
import type { TexRenderer } from '../host/renderQueue.ts';
import { circuitPlugin } from './markdownItPlugin.ts';
import { createPreviewRefresher } from './previewRefresher.ts';

export type Wiring = {
  /** TeX を SVG にする人。デスクトップは WASM、web は「描けない」を返すスタブ。 */
  readonly render: TexRenderer;
  /** プレビューに描き直させる頼み先。 */
  readonly refresh: () => void;
};

/**
 * 拡張の組み立て。外の世界に触るもの (描画・プレビューへの指示) は
 * 入口から渡してもらう。ここから下は vscode を知らない。
 */
export function activateWith(wiring: Wiring) {
  const refresher = createPreviewRefresher(wiring.refresh);
  const queue = createRenderQueue({ render: wiring.render, onDrawn: refresher.request });

  return {
    /**
     * VS Code は markdown プレビューを開くときにこの拡張を活性化し、
     * 戻り値の extendMarkdownIt(md) の**戻り値をそのまま** markdown-it として使う。
     * 同期で必ず md を返すこと (undefined や Promise を返すとプレビューが真っ白になる)。
     */
    extendMarkdownIt(md: MarkdownIt): MarkdownIt {
      return md.use(circuitPlugin(queue));
    },
  };
}
