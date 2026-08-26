import { NOTE_MARK_COLOR, NOTE_MARK_TEXT } from '../notes.ts';
import type { NoteOverlay } from '../types.ts';
import { escapeHtml } from './html.ts';

/**
 * 描き上がった SVG に、注釈の字を差し込む。
 *
 * フェンス側の TeX (WASM) には日本語のフォントが無いので、字は TeX に渡さず、
 * 置き場所だけを目印の色の 1 文字として描かせてある (tex/generate.ts)。
 * ここでその text 要素を見つけて、中身と色とフォントだけ入れ替える。
 * 位置 (x / y / transform) と大きさ (font-size) は TeX が決めたものを使うので、
 * 座標系を二重に持たなくてよい。
 *
 * **色を差し替える前に呼ぶこと**。色を書かなかった注釈は `#000000` で出るので、
 * その後の recolorSvg がテーマの文字色に塗り替える。
 */

/** 図に出る字は、標準の TeX フォントには字形が無い。読み手の環境のフォントで組む。 */
const FONT_FAMILY = "'Noto Sans CJK JP','Noto Sans JP','Hiragino Sans','Yu Gothic',sans-serif";

/** 目印の text 要素。属性の並びはエンジンが決めるので、色の一致だけで拾う。 */
const MARK = new RegExp(
  `<text\\b([^>]*\\bfill="${NOTE_MARK_COLOR}"[^>]*)>${NOTE_MARK_TEXT}</text>`,
  'g',
);

const withColor = (attributes: string, color: string): string =>
  attributes.replace(`fill="${NOTE_MARK_COLOR}"`, `fill="${color}"`);

const withFont = (attributes: string): string =>
  attributes.replace(/\bfont-family="[^"]*"/, `font-family="${FONT_FAMILY}"`);

/** エンジンが目印の色を掛けた器 (`<g>`)。中の字を差し替えたら、その色は用済み。 */
const GROUP = /<g\b[^>]*>/g;
const MARK_ATTRIBUTE = new RegExp(`\\s(?:fill|stroke)="${NOTE_MARK_COLOR}"`, 'g');

/**
 * 器から目印の色を外す。**器の色だけ**を外すので、当てられなかった目印の字は
 * 色付きのまま図に残る (それが「注釈が出ていない」ことの合図になる)。
 */
const cleanGroups = (svg: string): string =>
  svg.replace(GROUP, (tag) => (tag.includes(NOTE_MARK_COLOR) ? tag.replace(MARK_ATTRIBUTE, '') : tag));

/**
 * 注釈を書いた順に、目印を字へ差し替える。
 *
 * 数が食い違うときは**足りるところまで**当てる。余った目印は色付きの
 * 1 文字として図に残るので、「注釈を書いたのに何も出ない」と黙って終わらない
 * (CLAUDE.md 約束 5)。
 */
export function applyNotes(svg: string, notes: readonly NoteOverlay[]): string {
  if (notes.length === 0) return svg;

  let index = 0;
  const filled = svg.replace(MARK, (whole, attributes: string) => {
    const note = notes[index];
    if (note === undefined) return whole;
    index += 1;
    return `<text${withFont(withColor(attributes, note.color))}>${escapeHtml(note.text)}</text>`;
  });

  return cleanGroups(filled);
}
