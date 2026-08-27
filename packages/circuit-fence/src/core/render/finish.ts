import { VERSION } from '../version.ts';
import type { NoteOverlay } from '../types.ts';
import { applyNotes } from './noteText.ts';
import { recolorSvg, resizeSvg, scaleSvgToText } from './theme.ts';
import type { Theme } from './theme.ts';

/**
 * 描き上がった SVG を、読み手に出せる形に仕上げる。
 *
 * **順番に意味がある**ので 1 か所にまとめてある。プレビューと CLI が
 * それぞれ同じ順番を書いていると、片方だけ直したときに図が食い違う。
 *
 * 1. 注釈の字を差し込む — **色を塗り替えるより先**。色を書かなかった注釈は
 *    黒で出るので、次の塗り替えで文字色に乗る。
 * 2. テーマの色に塗り替える。
 * 3. 外寸を決める。
 * 4. どのバージョンで描いたかを刻む。
 */

/** 根の `<svg>`。前に空白が付くことがある。 */
const ROOT = /^(\s*<svg\b)/;

/** すでに刻んであるか。仕上げを 2 回通しても番号が 2 つ並ばないようにする。 */
const MARKED = /\sdata-circuit-fence="/;

/**
 * どのバージョンで描いた図かを、見た目を変えずに残す。
 *
 * **`stamp` の指定によらず必ず書く**。書き手が知りようのない値なので、
 * 手で書かせるわけにいかない。属性にしておくと、書き出した `.svg` は grep で、
 * プレビューの図は DOM から引ける。
 *
 * 根が見つからない図には何も書かない。刻めないだけで図は正しく出るので、
 * ここで投げると出るはずの図まで消える。
 */
export const markSvg = (svg: string): string =>
  MARKED.test(svg) ? svg : svg.replace(ROOT, `$1 data-circuit-fence="${VERSION}"`);

export type FinishOptions = {
  /** 描き上がった SVG に差し込む注釈の字 (compileCircuit が返したもの)。 */
  readonly notes: readonly NoteOverlay[];
  readonly theme: Theme;
  /** `style: width` に書かれた横ドット数。書かれていなければ null。 */
  readonly width: number | null;
  /**
   * 外寸を書かなかった図を、読み手の地の文の大きさに合わせるか。
   * **プレビューだけ**が true。書き出す `.svg` は貼り先の字の大きさを
   * こちらから決めるべきではないので、素の大きさのまま出す。
   */
  readonly fitToText?: boolean;
};

export function finishSvg(svg: string, options: FinishOptions): string {
  const { notes, theme, width, fitToText = false } = options;
  const painted = recolorSvg(applyNotes(svg, notes), theme);
  const sized = fitToText && width === null ? scaleSvgToText(painted) : resizeSvg(painted, width);

  return markSvg(sized);
}
