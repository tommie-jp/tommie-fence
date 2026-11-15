import type { MarkdownIt } from 'markdown-it';
import { circuitPlugin } from 'circuit-fence/plugin';
import { breadboardPlugin } from 'breadboard-fence/plugin';
import { perfboardPlugin } from 'perfboard-fence/plugin';
import { copperPlugin } from 'copper-fence/plugin';
import { vnaPlugin } from 'vna-fence/plugin';
import { scopePlugin } from 'scope-fence/plugin';
import { spectrumPlugin } from 'spectrum-fence/plugin';
import { graphPlugin } from 'graph-fence/plugin';
import { logicPlugin } from 'logic-fence/plugin';
import type { NeighborReaders } from './neighborData.ts';
import type { CardReader } from 'fence-kit';
import type { FigureSource } from 'circuit-fence/plugin';
import { imageAfterFencePlugin } from './imageAfterFence.ts';
import type { ImageAfterFenceOptions } from './imageAfterFence.ts';

/**
 * プレビューの拡張。**9 つとも 1 つの `extendMarkdownIt` で登録する。**
 * VS Code は拡張ごとに 1 回しか呼ばないので、フェンスの数だけ `use` を重ねる。
 *
 * 描く順は関係ない (それぞれ自分の言語のフェンスしか触らない)。
 * vna・scope・spectrum・graph の `data:` を読む口 (`readers`) はデスクトップだけが渡す (logic に `data:` はまだ無い)。
 * 最後に、フェンスの直後の GitHub 用の画像を畳む (52 の docs/101)。
 */
export const allPlugins = (
  figures: FigureSource, imageAfterFence: ImageAfterFenceOptions, readers?: NeighborReaders, cards?: CardReader,
) => (md: MarkdownIt): MarkdownIt =>
  // 部品カード (52 の docs/158) は circuit・bread・perf の 3 つだけが型番を引く。
  md.use(circuitPlugin(figures, cards)).use(breadboardPlugin, cards).use(perfboardPlugin, cards).use(copperPlugin)
    .use(vnaPlugin(readers?.vna)).use(scopePlugin(readers?.scope))
    .use(spectrumPlugin(readers?.spectrum)).use(graphPlugin(readers?.graph)).use(logicPlugin())
    .use(imageAfterFencePlugin(imageAfterFence));
