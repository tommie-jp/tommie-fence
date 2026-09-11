import { labelOf, lineOfOffset, spanOffsets } from '../document.ts';
import type { LineSpan } from '../document.ts';
import { showSpan } from '../reveal.ts';
import { spanToReveal } from '../workspace.ts';
import { listenDialog, openDialog } from './dialog.ts';
import { els } from './els.ts';
import { isFine, showSheet } from './layout.ts';
import { changed, ws } from './workspace.ts';

/**
 * Markdown の窓 (52 の docs/48)。中身は文書の全文と、いまのフェンスの図。
 * 図を描くのは `paint.ts`、ここは窓の開け閉め、字の欄、フェンスの選び手。
 */

/** 打鍵のたびに描くと重い図で引っかかるので、少し待ってからまとめて描く。 */
const QUIET_MS = 150;

export const isMarkdownOpen = (): boolean => els.mdBox.open;

/** 文書の中のフェンスを並べる。**1 本しか無くても出す** (何を見ているかの札)。 */
export function fillFences(): void {
  els.fence.replaceChildren();
  for (const [index, fence] of ws.fences.entries()) {
    const option = document.createElement('option');
    option.value = String(index);
    // 言語を添える。**1 つの `.md` に 2 つの言語が混ざる**ことがある。
    option.textContent = `${labelOf(fence)} — ${fence.kind}`;
    els.fence.append(option);
  }
  els.fence.disabled = ws.fences.length === 0;
  pickFence();
}

/** 選び手をいまのフェンスに合わせる (一覧は組み直さない)。 */
export function pickFence(): void {
  els.fence.value = String(ws.at);
}

/**
 * 字の欄の、その行を見える所へ寄せて選んでおく。**焦点を移すのはマウスのある
 * 端末だけ** — 指の端末で移すとキーボードが出て、窓の図が隠れる。
 */
export function revealSpan(span: LineSpan, focus: boolean): void {
  showSpan(els.source, spanOffsets(ws.text(), span), { focus: focus && isFine() });
}

/**
 * 窓の字の欄で、見せたい所を選んでおく (どこかは `spanToReveal` が決める)。
 *
 * `focus` は窓を開いたときだけ立てる。フェンスの選び手から呼ぶときに焦点を
 * 奪うと、矢印キーで選び手を送る人が 1 つ目で止まる (閉じた選び手は矢印の
 * たびに change を鳴らす)。
 */
function revealLine(focus: boolean): void {
  const span = spanToReveal({
    fences: ws.fences,
    at: ws.at,
    touched: ws.touched,
    caretLine: lineOfOffset(ws.text(), els.source.selectionStart),
  });
  ws.forget();
  if (span !== null) revealSpan(span, focus);
}

/**
 * 窓を開く。**図は開いたときに描く** — 閉じているあいだは描いていない
 * (`paint.ts`)。`view` の知らせで映す側が描き直す。
 */
export function showMarkdown(): void {
  openDialog(els.mdBox, els.md);
  changed('view');
  revealLine(true);
}

/** 字の欄。打鍵は少し待ってまとめて映し、カーソルのあるフェンスへ移る。 */
function listenSource(): void {
  let timer = 0;
  // **カーソルのあるフェンスへ移る** — 拡張と同じ決め方 (カーソルのあるフェンスが「いま」)。
  const follow = (): void => {
    if (ws.follow(els.source.selectionStart)) changed('select');
  };
  els.source.addEventListener('input', () => {
    // 窓で字を直したら、殻が直した所はもう「直前」ではない。
    ws.forget();
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      ws.reread();
      ws.follow(els.source.selectionStart);
      changed('text');
    }, QUIET_MS);
  });
  // 打鍵は上で見ているので、動かすだけの出来事をここで拾う (押した・矢印で動かした)。
  els.source.addEventListener('click', follow);
  els.source.addEventListener('keyup', follow);
}

export function listenMarkdown(): void {
  els.md.addEventListener('click', () => {
    // 畳んだ姿の板が開いたままだと、窓を閉じたときに残っている。
    showSheet(false);
    showMarkdown();
  });
  listenDialog(els.mdBox, els.md);
  els.fence.addEventListener('change', () => {
    if (ws.select(Number(els.fence.value))) changed('select');
    // **選んだフェンスへ字の欄も寄せる** (52 の docs/43 の「選ぶと欄のカーソルを
    // その中へ置く」)。窓の中で選ぶので、図だけ変わって字が動かないと、
    // どこのフェンスを見ているのかが字の側で分からない。
    if (isMarkdownOpen()) revealLine(false);
  });
  listenSource();
}
