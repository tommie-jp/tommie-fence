import { element, num, svgText } from 'fence-kit';
import type { Layout } from '../model/layout.ts';
import { VERSION } from '../version.ts';
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
};

/** 刻印を板の縁からどれだけ内へ置くか。 */
const STAMP_INSET = 4;

export function renderDocument(layout: Layout, body: string, options: DocumentOptions): string {
  const { theme, width = null, stamp = false } = options;

  // **`width` は画布の大きさだけを変える。** viewBox はそのままなので、
  // 図の中身 (番地と実寸の対応) は動かない。
  const scale = width === null ? 1 : width / layout.width;

  // **地はいちばん下に敷く。** 地を決めたテーマ (dark / mono) は、貼った先の
  // 背景に関わらず読めなければならない — 板の外の字は地の上に乗るため。
  const canvas = theme.palette.canvas === null
    ? ''
    : element('rect', {
      x: 0, y: 0, width: num(layout.width), height: num(layout.height), fill: theme.palette.canvas,
    });

  const stamped = stamp
    ? svgText(
      layout.board.x + layout.board.width - STAMP_INSET,
      layout.height - STAMP_INSET,
      `perfboard-fence ${VERSION}`,
      { anchor: 'end', fill: theme.palette.label, 'font-size': num(theme.metrics.textSize) },
    )
    : '';

  return element(
    'svg',
    {
      xmlns: 'http://www.w3.org/2000/svg',
      viewBox: `0 0 ${num(layout.width)} ${num(layout.height)}`,
      width: num(layout.width * scale),
      height: num(layout.height * scale),
      'data-perfboard-fence': VERSION,
      role: 'img',
    },
    `${canvas}${body}${stamped}`,
  );
}
