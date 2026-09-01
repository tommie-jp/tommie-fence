import { element, num } from 'fence-kit';
import type { Layout } from '../model/layout.ts';
import { VERSION } from '../version.ts';

/**
 * 図の外側。**それ自体で完結した SVG** にする — 外部リソースも
 * スクリプトも参照しない。他人のノートに貼られる図なので、
 * 貼った先の環境に何も要求しない形にしておく。
 *
 * 版を根に書いておくと、資料に貼った `.svg` を後から見て
 * どの版が描いたかが分かる (刻印を出していない図でも)。
 */
export const renderDocument = (layout: Layout, body: string): string =>
  element(
    'svg',
    {
      xmlns: 'http://www.w3.org/2000/svg',
      viewBox: `0 0 ${num(layout.width)} ${num(layout.height)}`,
      width: num(layout.width),
      height: num(layout.height),
      'data-perfboard-fence': VERSION,
      role: 'img',
    },
    body,
  );
