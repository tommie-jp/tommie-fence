/**
 * 図に重ねる注釈 (`notes:`) の決まりごと。色・大きさ・寄せの表と、字の見積り。
 *
 * 注釈は**回路の一員ではない**。ネットにも分岐の黒丸にも数えず、
 * 図の上に印と字を置くだけ。だからこの表は parts.ts とは別に持つ。
 *
 * 色も大きさも**こちらが決めた名前だけ**を通す。書き手に任意の値を許すと、
 * 描き上がった SVG の塗り替え (render/theme.ts が `#000` / `#fff` / `gray` を
 * 目印にしている) とぶつかる色や、実機で確かめていない字の大きさを書けてしまう。
 * 名前から表を引く形にしておけば、図に入る値は必ず検証済みになる
 * (CLAUDE.md 約束 3・6)。
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

/**
 * 書かれた色の名前を実際の色にする。知らない名前は null (呼ぶ側が理由を返す)。
 *
 * 表は**自分の持ちものだけ**を見る。素の `[名前]` で引くと `toString` のような
 * Object.prototype の名前が当たり、色でない値が色として通ってしまう。
 */
export const noteColor = (name: string | null): string | null => {
  if (name === null) return NOTE_INK;
  return Object.hasOwn(NOTE_COLORS, name) ? NOTE_COLORS[name as keyof typeof NOTE_COLORS] : null;
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

/**
 * 使える字の大きさ。**極小から極大まで 5 段**だけを通す。
 *
 * pt の直接指定は受け付けない。フェンス側の TeX (WASM) はフォントが無いと
 * 例外ではなくプロセスごと落ちるので、図に入る大きさは実機で確かめたものに
 * 限る (約束 6。5 段とも 1 段 = 1 プロセスで通してある)。
 *
 * TeX 側の名前とはわざとずらしてある。フェンスの既定は `\footnotesize` で、
 * TeX の `\normalsize` より 2 段小さいところに座っているため
 * (ここを揃えると、既定を変えずに「大」を足せない)。
 */
const NOTE_SIZES = {
  tiny: { tex: '\\tiny', pt: 5 },
  small: { tex: '\\scriptsize', pt: 7 },
  normal: { tex: '\\footnotesize', pt: 8 },
  large: { tex: '\\large', pt: 12 },
  huge: { tex: '\\LARGE', pt: 17.28 },
} as const;

export type NoteSize = keyof typeof NOTE_SIZES;

export const NOTE_SIZE_NAMES: readonly string[] = Object.keys(NOTE_SIZES);

/** 大きさを書かなかった注釈の大きさ。足す前からの見た目を変えない。 */
export const DEFAULT_NOTE_SIZE: NoteSize = 'normal';

/** 書かれた語が大きさの名前か。色と同じく、自分の持ちものだけを見る。 */
export const isNoteSize = (name: string): name is NoteSize => Object.hasOwn(NOTE_SIZES, name);

/**
 * TeX に渡す字の指定。**表にある指定だけ**を綴るので、書き手の字は入らない。
 * 太字は太さのフォントに切り替える指定を書き足す。
 */
export const noteFontTex = (size: NoteSize, bold: boolean): string =>
  `${NOTE_SIZES[size].tex}${bold ? '\\bfseries' : ''}`;

/** 1 pt を cm にした値。場所取りの見積りに使うだけなので、SVG と同じ 1/72 in で足りる。 */
const PT_TO_CM = 2.54 / 72;

/**
 * その大きさの 1 em (pt)。**SVG の viewBox と font-size はこれと同じ物差し**
 * (`normal` の注釈は font-size="8" で出る)。図の外寸を字の大きさで割るのに使う。
 */
export const notePt = (size: NoteSize): number => NOTE_SIZES[size].pt;

/** その大きさの 1 em (cm)。図で場所をどれだけ取るかの物差し。 */
export const noteEm = (size: NoteSize): number => notePt(size) * PT_TO_CM;

/** 行送りが 1 em の何倍か。詰めすぎず、図より高くならない値。 */
const LINE_HEIGHT = 1.4;

/**
 * 何行も書く注釈の行送り (cm)。**格子の間隔ではなく字の大きさで決める**。
 * 番地の刻み (既定 2cm) で送ると、数行書いただけで図より注釈のほうが高くなる。
 */
export const noteLine = (size: NoteSize): number => noteEm(size) * LINE_HEIGHT;

/**
 * 書き出し (`source`) の行送りが 1 em の何倍か。**地の文より詰める**。
 *
 * 地の文の 1.4 は、図の中に 1 行ぽつんと置く字に合わせた値。書き出しは
 * 何行も続けて並ぶので、そのまま送ると行の間だけが目立って塊として読めない。
 * 1 em を割ると上の行の下がりと下の行の上がりが噛むので、そこまでは詰めない。
 */
const SOURCE_LINE_HEIGHT = 1.15;

/**
 * 書き出しの行送りを選ぶ語。**書かなかったときが既定の詰めた送り**なので、
 * 語は「もっと詰める」「字の注釈と同じだけ空ける」の 2 つで足りる。
 *
 * 段に `normal` を置かないのは、それが**字の大きさの名前として埋まっている**ため。
 * 語は 1 つの並びに混ぜて書くので、同じ名前があるとどちらの意味か決められない。
 */
export const NOTE_LEADINGS = ['tight', 'loose'] as const;

export type NoteLeading = (typeof NOTE_LEADINGS)[number];

export const isNoteLeading = (name: string): name is NoteLeading =>
  (NOTE_LEADINGS as readonly string[]).includes(name);

/**
 * 段ごとの、1 em に対する行送りの倍率。
 * **どれも 1 em を下回らない** — 割ると上の行の下がりと下の行の上がりが噛む。
 */
const SOURCE_LEADINGS: Readonly<Record<NoteLeading, number>> = {
  tight: 1,
  loose: LINE_HEIGHT,
};

/**
 * 書き出しの行送り (cm)。等幅で何行も並べる前提で、既定は地の文より詰めてある。
 * `leading` が null は「書かなかった」— 段の表に既定を置くと `normal` が要る。
 */
export const noteSourceLine = (size: NoteSize, leading: NoteLeading | null): number =>
  noteEm(size) * (leading === null ? SOURCE_LINE_HEIGHT : SOURCE_LEADINGS[leading]);

/** 半角 1 文字の幅 (em)。少し多めに見て、図が字を切らないようにする。 */
const HALF_WIDTH = 0.6;

/** 太字の半角 1 文字の幅 (em)。大文字の多い題でも切れない側に振ってある。 */
const BOLD_HALF_WIDTH = 0.95;

/** 全角 1 文字の幅 (em)。 */
const FULL_WIDTH = 1.05;

/** 等幅で組む注釈 (元のフェンスの書き出し) の半角 1 文字の幅 (em)。 */
const MONO_WIDTH = 0.62;

/** 全角として数える字。ASCII とラテン 1 の外はまとめて全角とみなす。 */
const isFullWidth = (char: string): boolean => (char.codePointAt(0) ?? 0) > 0xff;

const widthOf = (text: string, size: NoteSize, half: number): number =>
  [...text].reduce((sum, char) => sum + (isFullWidth(char) ? FULL_WIDTH : half), 0) * noteEm(size);

/**
 * 注釈の字が図で占める幅 (cm)。
 *
 * フェンスでは字を TeX に渡さないので、**TeX は字の幅を知らない**。
 * 見積もった幅ぶんの場所を TeX 側で取っておかないと、図の縁に書いた注釈が
 * 切れる (SVG の viewBox からはみ出す)。
 */
export const noteWidth = (text: string, size: NoteSize): number => widthOf(text, size, HALF_WIDTH);

/**
 * 太字で組んだときに図で占める幅 (cm)。題 (`title:`) だけが使う。
 *
 * cmbx は cmr より字送りが広く、**大文字はさらに広い** (`W` はほぼ全角と同じ)。
 * 細字の見積もりのまま場所を取ると、大文字の多い題が図の右で切れる。
 * 全角の側は太字でも送りがほとんど変わらないので、半角の側だけ広げる。
 */
export const noteBoldWidth = (text: string, size: NoteSize): number =>
  widthOf(text, size, BOLD_HALF_WIDTH);

/**
 * 等幅で組んだときに図で占める幅 (cm)。字下げを保つので、空白も 1 文字と数える。
 */
export const noteMonoWidth = (text: string, size: NoteSize): number =>
  widthOf(text, size, MONO_WIDTH);

/** 字の寄せ。番地を字の左端・真ん中・右端のどこにするか。 */
export const NOTE_ALIGNS = ['left', 'center', 'right'] as const;

export type NoteAlign = (typeof NOTE_ALIGNS)[number];

/** 寄せを書かなかった注釈の寄せ。番地が字の左端になる (足す前からの決まり)。 */
export const DEFAULT_NOTE_ALIGN: NoteAlign = 'left';

export const isNoteAlign = (name: string): name is NoteAlign =>
  (NOTE_ALIGNS as readonly string[]).includes(name);

/** TikZ のアンカー。書き出す `.tex` は TeX に字を組ませるので、これで寄る。 */
export const texAnchorOf = (align: NoteAlign): string =>
  align === 'left' ? 'west' : align === 'right' ? 'east' : 'center';

/**
 * SVG の text-anchor。フェンスは**目印では寄せられない**
 * (目印は 1 文字で、差し込む本物の字とは幅が違う)。位置は TeX が決めた番地の
 * ままにして、字をその点のどちら側に置くかを SVG に決めさせる。
 * 左寄せは既定なので属性を足さない (足す前と同じ出力になる)。
 */
export const svgTextAnchorOf = (align: NoteAlign): string | null =>
  align === 'left' ? null : align === 'right' ? 'end' : 'middle';

/**
 * 字が図で占める左右の端 (cm)。番地 x を起点に、寄せに応じて広がる。
 * フェンスで場所を取っておく矩形は、これで求める。
 */
export const noteSpan = (
  x: number,
  width: number,
  align: NoteAlign,
): { readonly from: number; readonly to: number } =>
  align === 'left'
    ? { from: x, to: x + width }
    : align === 'right'
      ? { from: x - width, to: x }
      : { from: x - width / 2, to: x + width / 2 };

/** 色の値から `#` を外した 6 桁。TeX の `\definecolor{...}{HTML}{...}` に渡す形。 */
export const hexDigits = (color: string): string => color.slice(1).toUpperCase();
