/**
 * fence-kit — 3 つのフェンス (circuit / breadboard / perfboard) で
 * 重複している部分の置き場。
 *
 * ここに置くのは**フェンスの言語に依らないもの**だけ。先回りして共通化せず、
 * 実際に重複してから引き上げる (リポジトリ直下の CLAUDE.md)。
 *
 * ビルド工程を持たない。`exports` が `src/index.ts` を直に指し、使う側の
 * esbuild が束ねる。**external にしない** — `.vsix` を詰めるときパッケージを
 * 単体で install するので、npm 上に無い fence-kit は解決できない
 * (理由は直下の CLAUDE.md の約束 3)。
 */
export { normalizeNewlines } from './newlines.ts';
export { extractFences, outputStem } from './fences.ts';
export type { FenceBlock } from './fences.ts';
export { escapeMarkup, element } from './markup.ts';
export { num, svgText, TEXT_HALO_WIDTH } from './svg.ts';
export type { TextOptions } from './svg.ts';
export type { Attributes } from './markup.ts';
