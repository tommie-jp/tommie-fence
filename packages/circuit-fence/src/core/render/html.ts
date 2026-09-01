import { escapeMarkup } from 'fence-kit';

export type { Attributes } from 'fence-kit';
export { element } from 'fence-kit';

/**
 * 図の周りに置く文字列は必ずここを通す。VS Code の Markdown プレビューは
 * 拡張が返した HTML をサニタイズしないので、エスケープが唯一の防御になる。
 *
 * 中身は fence-kit にある。5 文字の実体参照と制御文字の切り捨ては XML と
 * HTML で同じで、分けると片方だけ直す事故が起きる (実際、breadboard 側に
 * `escapeXml` という名前で同じ実装が複製されていた)。
 */
export const escapeHtml = escapeMarkup;
