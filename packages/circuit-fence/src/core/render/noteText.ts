import { NOTE_MARK_COLOR, NOTE_MARK_TEXT, svgTextAnchorOf } from '../notes.ts';
import type { NoteAlign } from '../notes.ts';
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
 * **太さと寄せだけは TeX から受け取れない**。太さは TeX ではフォントの名前
 * (`cmbx8`) で表されるので、フォントごと入れ替えると消える。寄せは目印が
 * 1 文字で本物の字とは幅が違うため、TeX のアンカーでは決められない。
 * どちらも SVG の属性として書き直す。
 *
 * **色を差し替える前に呼ぶこと**。色を書かなかった注釈は `#000000` で出るので、
 * その後の recolorSvg がテーマの文字色に塗り替える。
 */

/** 図に出る字は、標準の TeX フォントには字形が無い。読み手の環境のフォントで組む。 */
const FONT_FAMILY = "'Noto Sans CJK JP','Noto Sans JP','Hiragino Sans','Yu Gothic',sans-serif";

/** 元のフェンスの書き出しは等幅で組む。日本語が混じっても崩れない並びにする。 */
const MONO_FAMILY = "'Noto Sans Mono CJK JP',ui-monospace,'SFMono-Regular',Consolas,'Liberation Mono',monospace";

/** 目印の text 要素。属性の並びはエンジンが決めるので、色の一致だけで拾う。 */
const MARK = new RegExp(
  `<text\\b([^>]*\\bfill="${NOTE_MARK_COLOR}"[^>]*)>${NOTE_MARK_TEXT}</text>`,
  'g',
);

const withColor = (attributes: string, color: string): string =>
  attributes.replace(`fill="${NOTE_MARK_COLOR}"`, `fill="${color}"`);

const withFont = (attributes: string, mono: boolean): string =>
  attributes.replace(/\bfont-family="[^"]*"/, `font-family="${mono ? MONO_FAMILY : FONT_FAMILY}"`);

/** 太字。書き足すだけで、太くない注釈の出力は足す前と同じにする。 */
const withWeight = (attributes: string, bold: boolean): string =>
  bold ? `${attributes} font-weight="bold"` : attributes;

/**
 * 寄せ。番地の点 (TeX が決めた x) に対して、字をどちら側へ置くかを決める。
 * 左寄せは SVG の既定なので何も足さない。
 */
const withAnchor = (attributes: string, align: NoteAlign): string => {
  const anchor = svgTextAnchorOf(align);
  return anchor === null ? attributes : `${attributes} text-anchor="${anchor}"`;
};

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
    // 字下げは書き出しの意味そのものなので、SVG の既定 (空白を詰める) を止める。
    const space = note.mono ? ' xml:space="preserve"' : '';
    const shown = withAnchor(
      withWeight(withFont(withColor(attributes, note.color), note.mono), note.bold),
      note.align,
    );
    return `<text${shown}${space}>${escapeHtml(note.text)}</text>`;
  });

  return cleanGroups(filled);
}
