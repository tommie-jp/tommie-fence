import { extractFences } from 'fence-kit';
import type { FenceBlock } from 'fence-kit';

export type { FenceBlock };

/**
 * Markdown から ```vna フェンスだけを取り出す。
 * markdown-it を通さずに使えるので、CLI や別アプリのサーバー側描画から呼べる。
 *
 * 取り出しの規則そのものは fence-kit にある (4 つのフェンスで同じもの)。
 * ここは言語名を渡すだけの包み。
 */
export const extractVnaFences = (markdown: string): FenceBlock[] =>
  extractFences(markdown, 'vna');
