import type { MarkdownIt } from 'markdown-it';
import { circuitPlugin } from 'circuit-fence/plugin';
import { breadboardPlugin } from 'breadboard-fence/plugin';
import { perfboardPlugin } from 'perfboard-fence/plugin';
import { copperPlugin } from 'copper-fence/plugin';
import { vnaPlugin } from 'vna-fence/plugin';
import { scopePlugin } from 'scope-fence/plugin';
import type { NeighborReaders } from './neighborData.ts';
import type { FigureSource } from 'circuit-fence/plugin';

/**
 * プレビューの拡張。**6 つとも 1 つの `extendMarkdownIt` で登録する。**
 * VS Code は拡張ごとに 1 回しか呼ばないので、フェンスの数だけ `use` を重ねる。
 *
 * 描く順は関係ない (それぞれ自分の言語のフェンスしか触らない)。
 * vna と scope の `data:` を読む口 (`readers`) はデスクトップだけが渡す。
 */
export const allPlugins = (figures: FigureSource, readers?: NeighborReaders) => (md: MarkdownIt): MarkdownIt =>
  md.use(circuitPlugin(figures)).use(breadboardPlugin).use(perfboardPlugin).use(copperPlugin)
    .use(vnaPlugin(readers?.vna)).use(scopePlugin(readers?.scope));
