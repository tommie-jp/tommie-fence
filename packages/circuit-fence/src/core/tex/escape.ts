/**
 * 図に出る文字の関門。**ユーザーが書いた文字から任意の TeX を作らせない**ため、
 * 許可した文字だけを通し、TeX が自分の記法として読む文字は綴り直す
 * (CLAUDE.md 設計上の約束 3)。値やラベルは必ずここを通してから TeX へ渡す。
 */

import type { TexTarget } from '../types.ts';

// 回路図の値とラベルに要る字だけ。\ $ { } ^ & # ~ は入れない
// (通してしまうと、エスケープ漏れが 1 つあれば任意の TeX になる)。
//
// `,` と `=` も入れない。circuitikz の `to[..., l=..., a=...]` の中では
// この 2 つがオプションの区切りとして読まれ、波括弧で包んでも守れない
// (実機で確認済み: `a=$1,5k$` も `a={$1,5k$}` もコンパイルが止まる)。
// 小数点は `.` で書ける。
const ASCII_DRAWABLE = 'A-Za-z0-9 .+\\-/()_%';

/**
 * 書き出す `.tex` でだけ通す字。フォントを積めるので、標準の TeX フォントに
 * 字形が無いものも出せる。**広げるのは字の種類だけ**で、記法として読まれる字
 * (`,` `=` `\` `$` …) は latex でも通さない。
 *
 * ひらがな・カタカナ・漢字 (と拡張 A)・々・読点と句点、それに値でよく使う
 * µ Ω ° を入れる。ハングルや絵文字は入れない (フォントが持っている保証がない)。
 *
 * µ と Ω は**見た目が同じ字が 2 つずつある**ので両方入れる。データシートから
 * 貼った値がどちらで来るかは選べず、片方だけ通すと目で見て直せないエラーになる
 * (µ は U+00B5 と U+03BC、Ω は U+03A9 と U+2126)。
 */
const UNICODE_DRAWABLE =
  '\\u00B0\\u00B5\\u03A9\\u03BC\\u2126\\u3001\\u3002\\u3005\\u3040-\\u30FF\\u3400-\\u4DBF\\u4E00-\\u9FFF';

const DRAWABLE: Readonly<Record<TexTarget, RegExp>> = {
  fence: new RegExp(`^[${ASCII_DRAWABLE}]*$`, 'u'),
  latex: new RegExp(`^[${ASCII_DRAWABLE}${UNICODE_DRAWABLE}]*$`, 'u'),
};

const NON_ASCII = /[^ -~]/u;

/** その TeX で描ける字だけでできているか。 */
export const isDrawable = (text: string, target: TexTarget): boolean => DRAWABLE[target].test(text);

/** ASCII だけでできているか。日本語などはフェンスの TeX にフォントが無い。 */
export const isAscii = (text: string): boolean => !NON_ASCII.test(text);

/**
 * 標準の TeX フォントに字形が無い字を含んでいるか。
 * 含む値があるときだけ、書き出す `.tex` にフォントの行を足す
 * (その 1 行だけが相手の環境で落ちうるので、要らないなら書かない)。
 */
export const hasUnicode = (text: string): boolean => !isAscii(text);

const TEX_ESCAPES: Record<string, string> = { _: '\\_', '%': '\\%' };

/** 許可済みの文字のうち、TeX が自分の記法として読むものを綴り直す。 */
export const escapeTex = (text: string): string => text.replace(/[_%]/g, (char) => TEX_ESCAPES[char] ?? char);
