/**
 * 描き上がった SVG に、使っている TeX のフォントを埋め込む (`render --embed-fonts`)。
 *
 * なぜ要るか: TeX が描いた字は、SVG の中で Unicode ではなく**フォントの中の番号**のまま
 * 入っている (Ω は `¬`、µ は `¹`、数式の小数点は `:`)。`cmr10` などの名前のフォントが
 * あるときだけ正しい形に見え、プレビューはそれを読み込んでいるが、書き出した `.svg` を
 * ブラウザや GitHub で開くと化ける。普通のフォントを入れても直らない
 * (必要なのは同じ番号の並びを持つ、このフォントそのもの)。
 *
 * ここは文字列を組むだけの純関数。フォントのファイルを読むのはガワ (`host/texFonts.ts`)。
 */

/** TeX のフォント名の形。英小文字の後に大きさの数字 (`cmr10` `cmmi7` `msam10`)。 */
const TEX_FONT = /^[a-z]+\d+$/;

const FAMILY = /\bfont-family="([^"]*)"/g;

/** 根の `<svg …>`。前に空白が付くことがある。 */
const ROOT = /^(\s*<svg\b[^>]*>)/;

/** 埋め込んだ印。2 回通しても同じフォントを 2 つ並べない。 */
const MARK = 'data-circuit-fonts';

/** SVG が使っている TeX のフォントの名前。初めて出た順に 1 つずつ。 */
export function texFontFamilies(svg: string): string[] {
  const seen = new Set<string>();
  for (const [, family = ''] of svg.matchAll(FAMILY)) {
    if (TEX_FONT.test(family)) seen.add(family);
  }
  return [...seen];
}

/**
 * `fonts` (フォント名 → TTF の base64) のうち、SVG が使っているものを `@font-face` にして
 * 根の直後に置く。手元に無いフォントは飛ばす (その字は今までどおり化けるが、図は出る)。
 */
export function embedFonts(svg: string, fonts: ReadonlyMap<string, string>): string {
  if (svg.includes(`${MARK}=`)) return svg;

  const faces = texFontFamilies(svg)
    .filter((family) => fonts.has(family))
    .map((family) => `@font-face{font-family:${family};src:url(data:font/ttf;base64,${fonts.get(family) ?? ''})}`);
  if (faces.length === 0) return svg;

  return svg.replace(ROOT, `$1<style ${MARK}="">${faces.join('')}</style>`);
}
