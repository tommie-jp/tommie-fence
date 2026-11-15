import type { MarkdownIt } from 'markdown-it';
import { createRenderQueue } from 'circuit-fence/queue';
import type { TexRenderer } from 'circuit-fence/queue';
import { createPreviewRefresher } from './previewRefresher.ts';
import { allPlugins } from './markdownItPlugin.ts';
import type { NeighborReaders } from './neighborData.ts';
import type { CardReader } from 'fence-kit';
import type { ImageAfterFenceOptions } from './imageAfterFence.ts';

export type Wiring = {
  /** TeX を SVG にする人。デスクトップは WASM、web は「描けない」を返すスタブ。 */
  readonly render: TexRenderer;
  /** プレビューに描き直させる頼み先。 */
  readonly refresh: () => void;
  /** フェンスの直後の GitHub 用の画像をどう出すか (設定と見出しの訳は入口が持つ)。 */
  readonly imageAfterFence: ImageAfterFenceOptions;
  /**
   * vna の `data:` (Touchstone) と scope・spectrum・graph の `data:` (CSV) を読む口。**デスクトップだけが
   * 持つ** — 描いている文書の隣のファイルを読む。web 版は持たない (フェンスが「読めません」と言う)。
   */
  readonly readers?: NeighborReaders;
  /** 部品カードを訊く口 (52 の docs/158)。**デスクトップだけ** — 文書の上の `.tommie-fence/parts/` を読む。 */
  readonly cards?: CardReader;
  /**
   * 描いた回路図をしまう置き場 (52 の docs/163)。**デスクトップだけ** — ディスクに控えて、開き直しても描き直さない。
   * web 版は TeX を回さないので渡さない。
   */
  readonly figureStore?: { readonly get: (hash: string) => string | undefined; readonly put: (hash: string, svg: string) => void };
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
  const queue = createRenderQueue({
    render: wiring.render, onDrawn: refresher.request,
    ...(wiring.figureStore === undefined ? {} : { store: wiring.figureStore }),
  });

  return {
    extendMarkdownIt(md: MarkdownIt): MarkdownIt {
      return allPlugins(queue, wiring.imageAfterFence, wiring.readers, wiring.cards)(md);
    },
  };
}
