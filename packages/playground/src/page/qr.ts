import { linkTo } from '../files.ts';
import { qrSvg } from '../qr.ts';
import { listenDialog, openDialog } from './dialog.ts';
import { els } from './els.ts';
import { say } from './log.ts';
import { pageUrl } from './where.ts';
import { ws } from './workspace.ts';

/**
 * いま開いている文書を指すリンクの QR。**スマホで開き直す・人に渡す**道
 * (52 の docs/44)。
 *
 * 入れるのは**中身ではなく置き場**。手元のファイルにはそれが無い —
 * ディスクの上にしか無く、相手の端末には存在しない — ので、そのときは
 * **頁の URL だけ**を入れて、渡せないことを言う (実機で決めた形)。
 *
 * 開くたびに組み直す。文書を替えれば指す先も変わるので、覚えておくと
 * 前の文書の QR を出すことになる。
 */
function showQr(): void {
  const { name, url } = ws.doc;
  const link = linkTo(pageUrl(), url);
  els.qrUrl.textContent = link;
  const shown = name === '' ? 'いまの文書' : name;
  els.qrKind.textContent = url === null
    ? `この頁を開くリンク (${shown} は手元にあるので渡せません)`
    : 'この文書を開くリンク';

  const drawn = qrSvg(link);
  els.qrCode.innerHTML = drawn ?? '';
  els.qrCode.hidden = drawn === null;
  if (drawn === null) say('この長さは QR に入りません', true);

  openDialog(els.qrBox, els.qr);
}

export function listenQr(): void {
  els.qr.addEventListener('click', showQr);
  listenDialog(els.qrBox, els.qr);
}
