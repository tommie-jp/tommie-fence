import { element, num, svgText } from 'fence-kit';
import type { Layout } from '../model/layout.ts';
import { STAMP_TEXT, VERSION } from '../version.ts';
import type { Theme } from './theme.ts';

/**
 * 図の外側。**それ自体で完結した SVG** にする — 外部リソースも
 * スクリプトも参照しない。他人のノートに貼られる図なので、
 * 貼った先の環境に何も要求しない形にしておく。
 *
 * 版を根に書いておくと、資料に貼った `.svg` を後から見て
 * どの版が描いたかが分かる (刻印を出していない図でも)。
 */
export type DocumentOptions = {
  readonly theme: Theme;
  /** 出したい横ドット数。**縦は縦横比で決まる** (図の形は変えない)。 */
  readonly width?: number | null;
  /** 図の右下に処理系の版を刻むか。 */
  readonly stamp?: boolean;
  /**
   * 画布の大きさ。**書かなければ板の寸法なり**。半田面を足したときのように、
   * 1 つの `layout` に収まらないものを並べるときだけ外から渡す。
   */
  readonly canvas?: { readonly width: number; readonly height: number } | null;
  /**
   * 図の中で参照する定義 (`<defs>`)。いまのところ白黒の網だけ。
   * **図が使ったものだけ**を渡す (使っていない定義を抱えた SVG を貼らせない)。
   */
  readonly defs?: string;
};

/** 刻印を板の縁からどれだけ内へ置くか。 */
const STAMP_INSET = 4;

export function renderDocument(layout: Layout, body: string, options: DocumentOptions): string {
  const { theme, width = null, stamp = false, canvas: given = null, defs = '' } = options;
  const size = given ?? { width: layout.width, height: layout.height };

  // **`width` は画布の大きさだけを変える。** viewBox はそのままなので、
  // 図の中身 (番地と実寸の対応) は動かない。
  const scale = width === null ? 1 : width / size.width;

  // **地はいちばん下に敷く。** 地を決めたテーマ (dark / mono) は、貼った先の
  // 背景に関わらず読めなければならない — 板の外の字は地の上に乗るため。
  const canvas = theme.palette.canvas === null
    ? ''
    : element('rect', {
      x: 0, y: 0, width: num(size.width), height: num(size.height), fill: theme.palette.canvas,
    });

  const stamped = stamp
    ? svgText(
      layout.board.x + layout.board.width - STAMP_INSET,
      size.height - STAMP_INSET,
      STAMP_TEXT,
      { anchor: 'end', fill: theme.palette.label, 'font-size': num(theme.metrics.textSize) },
    )
    : '';

  return element(
    'svg',
    {
      xmlns: 'http://www.w3.org/2000/svg',
      viewBox: `0 0 ${num(size.width)} ${num(size.height)}`,
      width: num(size.width * scale),
      height: num(size.height * scale),
      'data-perfboard-fence': VERSION,
      role: 'img',
    },
    `${defs}${canvas}${body}${stamped}`,
  );
}
