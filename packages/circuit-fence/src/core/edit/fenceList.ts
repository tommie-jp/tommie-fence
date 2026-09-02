import { extractCircuitFences } from '../fences.ts';
import { normalizeNewlines } from '../newlines.ts';
import { parseFence } from '../parser/parseFence.ts';

/** 文書の中の circuit フェンス 1 つ。マップの頭でどれを出すか選ばせるための札。 */
export type FenceEntry = {
  /** 開き記号の行 (1 始まり)。`fenceAt` にそのまま渡せる。 */
  readonly line: number;
  /** `title:` の字。無ければ (読めないフェンスも) null。 */
  readonly title: string | null;
};

/**
 * Markdown の中の circuit フェンスの一覧。
 *
 * **読めないフェンスも載せる。** 一覧から消すと、直すために選ぶことができない
 * (マップ側は読めないフェンスを空の升目として出す)。
 */
export function listFences(markdown: string): readonly FenceEntry[] {
  return extractCircuitFences(markdown).map((fence) => ({
    line: fence.line,
    title: parseFence(normalizeNewlines(fence.source)).doc?.title ?? null,
  }));
}
