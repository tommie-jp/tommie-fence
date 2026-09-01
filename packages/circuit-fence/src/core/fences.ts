import { extractFences } from 'fence-kit';
import type { FenceBlock } from 'fence-kit';

export type { FenceBlock };
export { outputStem } from 'fence-kit';

/**
 * Markdown から ```circuit フェンスだけを取り出す。
 * markdown-it を通さずに使えるので、CLI や別アプリのサーバー側描画から呼べる。
 *
 * 取り出しの規則そのものは fence-kit にある (3 つのフェンスで同じもの)。
 * ここは言語名を渡すだけの包み。
 */
export const extractCircuitFences = (markdown: string): FenceBlock[] =>
  extractFences(markdown, 'circuit');
