/**
 * 図に重ねる注釈 (`notes:`) の決まりごと。色の表と、字の大きさの見積り。
 *
 * 注釈は**回路の一員ではない**。ネットにも分岐の黒丸にも数えず、
 * 図の上に印と字を置くだけ。だからこの表は parts.ts とは別に持つ。
 *
 * 色は**こちらが決めた 4 つだけ**を通す。書き手に任意の色を許すと、
 * 描き上がった SVG の塗り替え (render/theme.ts が `#000` / `#fff` / `gray` を
 * 目印にしている) とぶつかる値を書けてしまう。名前から表を引く形にしておけば、
 * 図に入る色は必ず検証済みになる (CLAUDE.md 約束 3)。
 */

/**
 * 使える色。明るいテーマでも暗いテーマでも読める中間の明度を選んである
 * (テーマは地の色を変えるが、注釈の色は変えない)。
 */
export const NOTE_COLORS = {
  red: '#e5534b',
  blue: '#4c8eda',
  green: '#2ea043',
  orange: '#d29922',
} as const;

export const NOTE_COLOR_NAMES: readonly string[] = Object.keys(NOTE_COLORS);

/**
 * 色を書かなかった注釈の色。**テーマが塗り替える黒**をそのまま置く
 * (render/theme.ts が `#000000` を ink に差し替える)。
 * こうすると、色なしの注釈だけが図のほかの文字と同じ色で出る。
 */
export const NOTE_INK = '#000000';

/** 書かれた色の名前を実際の色にする。知らない名前は null (呼ぶ側が理由を返す)。 */
export const noteColor = (name: string | null): string | null => {
  if (name === null) return NOTE_INK;
  return NOTE_COLORS[name as keyof typeof NOTE_COLORS] ?? null;
};

/**
 * circuitikz に渡す色の名前。書き手の字をそのまま TeX に入れないよう、
 * **表にある名前だけ**を接頭辞付きで綴る (呼ぶ前に noteColor で確かめる)。
 */
export const texColorOf = (name: string): string => `circuitnote${name}`;

/**
 * フェンスで注釈の字を置く場所の目印に使う色。
 *
 * フェンス側の TeX (WASM) には日本語のフォントが無く、渡すと例外ではなく
 * **プロセスごと落ちる**。そこで TeX には字を渡さず、この色の 1 文字だけを
 * 置いて、描き上がった SVG でその場所に本物の字を差し込む
 * (render/noteText.ts)。図のほかの場所には出ない色を選んである。
 */
export const NOTE_MARK_COLOR = '#fe00fe';

/** 目印として置く 1 文字。1 文字なら SVG でも必ず 1 つの text 要素になる (実測)。 */
export const NOTE_MARK_TEXT = 'X';

/** 注釈の字の大きさ (cm)。TeX 側の `\footnotesize` (8pt) と合わせてある。 */
export const NOTE_EM = 0.282;

/** 半角 1 文字の幅 (em)。少し多めに見て、図が字を切らないようにする。 */
const HALF_WIDTH = 0.6;

/** 全角 1 文字の幅 (em)。 */
const FULL_WIDTH = 1.05;

/** 全角として数える字。ASCII とラテン 1 の外はまとめて全角とみなす。 */
const isFullWidth = (char: string): boolean => (char.codePointAt(0) ?? 0) > 0xff;

/**
 * 注釈の字が図で占める幅 (cm)。
 *
 * フェンスでは字を TeX に渡さないので、**TeX は字の幅を知らない**。
 * 見積もった幅ぶんの場所を TeX 側で取っておかないと、図の縁に書いた注釈が
 * 切れる (SVG の viewBox からはみ出す)。
 */
export const noteWidth = (text: string): number =>
  [...text].reduce((sum, char) => sum + (isFullWidth(char) ? FULL_WIDTH : HALF_WIDTH), 0) * NOTE_EM;

/**
 * 何行も書く注釈の行送り (cm)。**格子の間隔ではなく字の大きさで決める**。
 * 番地の刻み (既定 2cm) で送ると、数行書いただけで図より注釈のほうが高くなる。
 */
export const NOTE_LINE = NOTE_EM * 1.4;

/** 等幅で組む注釈 (元のフェンスの書き出し) の 1 文字の幅 (em)。 */
const MONO_WIDTH = 0.62;

/**
 * 等幅で組んだときに図で占める幅 (cm)。字下げを保つので、空白も 1 文字と数える。
 */
export const noteMonoWidth = (text: string): number =>
  [...text].reduce((sum, char) => sum + (isFullWidth(char) ? FULL_WIDTH : MONO_WIDTH), 0) * NOTE_EM;

/** 色の値から `#` を外した 6 桁。TeX の `\definecolor{...}{HTML}{...}` に渡す形。 */
export const hexDigits = (color: string): string => color.slice(1).toUpperCase();
