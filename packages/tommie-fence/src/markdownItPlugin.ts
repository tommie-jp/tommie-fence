import type { MarkdownIt } from 'markdown-it';
import { circuitPlugin } from 'circuit-fence/plugin';
import { breadboardPlugin } from 'breadboard-fence/plugin';
import { perfboardPlugin } from 'perfboard-fence/plugin';
import type { FigureSource } from 'circuit-fence/plugin';

/**
 * プレビューの拡張。**3 つとも 1 つの `extendMarkdownIt` で登録する。**
 * VS Code は拡張ごとに 1 回しか呼ばないので、フェンスの数だけ `use` を重ねる。
 *
 * 描く順は関係ない (それぞれ自分の言語のフェンスしか触らない)。
 */
export const allPlugins = (figures: FigureSource) => (md: MarkdownIt): MarkdownIt =>
  md.use(circuitPlugin(figures)).use(breadboardPlugin).use(perfboardPlugin);
