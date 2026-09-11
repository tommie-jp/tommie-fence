import type { Doc } from '../workspace.ts';
import { els } from './els.ts';

/**
 * 見出しの一文・文書の名札・出どころ。**いま何を開いているか**を言う所。
 * 文書は引数で受ける (状態を持たないので jsdom で確かめられる)。
 */

const REPO = 'https://github.com/tommie-jp/tommie-fence/blob/main';

/**
 * 一文をどちらの言語で出すか。**片方だけ出す** — 2 つ並べると、読めない
 * ほうの行が図を 1 行ぶん押し下げる (52 の docs/41)。
 * 字は両方 HTML にあるので、するのは hidden の切り替えだけ。
 */
const JA = navigator.language.startsWith('ja');

export function applyLanguage(): void {
  document.documentElement.lang = JA ? 'ja' : 'en';
  els.leadNoteJa.hidden = !JA;
  els.leadNoteEn.hidden = JA;
}

/**
 * 見出しの下の一文。**リンクの図を出しているあいだは、その図の題**にする。
 *
 * 「Markdown に書くと〜」は初めて来た人への案内。リンクを受けた人はもう
 * 図を見に来ているので、開いたものが何かを先に言うほうがよい
 * (52 の docs/41)。例を選び直したら案内に戻る。
 */
export function syncLead({ fromLink, title }: Doc): void {
  els.leadLink.hidden = !fromLink;
  els.leadJa.hidden = fromLink || !JA;
  els.leadEn.hidden = fromLink || JA;
  if (fromLink) els.leadTitle.textContent = title;
}

/**
 * いま開いている文書の名前。**直したままなら印を添える** — 頁を閉じると
 * 消えるので、直したことを画面から読み取れるようにしておく。
 */
export function showDocName({ name }: Doc, dirty: boolean): void {
  els.docName.replaceChildren();
  if (name === '') return;
  els.docName.append(name);
  if (!dirty) return;
  const mark = document.createElement('span');
  mark.className = 'dirty';
  mark.textContent = ' — 直したまま';
  els.docName.append(mark);
}

/** いま開いている文書の出どころ。手元で開いたものには無い。 */
export function showFrom({ from }: Doc): void {
  els.from.replaceChildren();
  if (from === null) return;

  const link = document.createElement('a');
  link.href = `${REPO}/${from}`;
  link.textContent = from;
  els.from.append('この例の出どころ: ', link);
}
