import { linkTo } from '../files.ts';
import { ws } from './workspace.ts';

/**
 * アドレス欄。**URL は文書の中身ではなく、文書の置き場を指す** (52 の docs/43 / 44)。
 */

/**
 * わざと壊した例を欄に出すか。**`?dev` で開いた人だけ。**
 * あれはエラーの帯を確かめるためのもので、初めて来た人には雑音になる
 * (52 の docs/41)。`?dev` は URL の問い合わせに残るので、選んでも消えない。
 */
export const DEV = new URLSearchParams(location.search).has('dev');

/** この頁そのもの (問い合わせも `#` も無い形)。リンクを組む基準。 */
export const pageUrl = (): string => `${location.origin}${location.pathname}`;

/**
 * アドレス欄を、いま開いている文書に合わせる。
 *
 * - 置き場のある文書 (例・`?doc=`) → `?doc=…`。読み込み直しても同じものが出る
 * - 手元のファイル → 頁の URL だけ。**指せるものが無い**
 * - 配ってあるリンクで来たとき → 来たときの `#` を残す (旧い形の読み)
 *
 * 履歴は積まない (打鍵のたびに戻れなくなるのを避けたのと同じ)。
 */
/** `?dev` を残す綴り。問い合わせが既にあれば `&` で継ぐ。 */
function devSuffix(link: string): string {
  if (!DEV) return '';
  return link.includes('?') ? '&dev' : '?dev';
}

export function showWhere(): void {
  const link = linkTo(pageUrl(), ws.doc.url);
  const hash = ws.doc.fromLink ? location.hash : '';
  history.replaceState(null, '', `${link}${devSuffix(link)}${hash}`);
}
