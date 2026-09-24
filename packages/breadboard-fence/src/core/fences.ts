import { extractFences } from 'fence-kit';
import type { FenceBlock } from 'fence-kit';

export type { FenceBlock };

/**
 * Markdown から ```bread フェンスだけを取り出す。長い綴り (```breadboard) も拾う。
 * markdown-it を通さずに使えるので、CLI や別アプリのサーバー側描画から呼べる。
 *
 * 取り出しの規則そのものは fence-kit にある (3 つのフェンスで同じもの)。
 * ここは言語名を渡すだけの包み。
 */
export const extractBreadboardFences = (markdown: string): FenceBlock[] =>
  extractFences(markdown, 'bread');
