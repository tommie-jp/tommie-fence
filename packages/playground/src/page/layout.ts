import { els } from './els.ts';

/**
 * 頁の姿 — 畳むか、板を出すか、指の拡大を通すか。**文書のことは知らない。**
 */

/**
 * ホーム画面から開いたか (PWA)。**iOS は `display-mode` を見ない**ので、
 * あちらの `navigator.standalone` も見る。
 */
const asApp = (): boolean => window.matchMedia('(display-mode: standalone)').matches
  || (navigator as Navigator & { standalone?: boolean }).standalone === true;

/**
 * 畳んで図に渡す画面。**マップの側の閾値と揃える** (`panelHtml` の幅 720px と
 * 高さ 500px) — ずれると、頁は畳んだのにマップは広いときの形、という
 * 食い違いが出る。
 *
 * **高さでも畳む** (約束 18、52 の docs/46)。横向きの iPhone は幅が 667〜932px で
 * 720 の両側にまたがり、幅だけで決めると 14 以降は畳まれない — editor から
 * 始める頁 (52 の docs/48) では、マップが最初の画面に半分しか入らなかった (実測)。
 */
const NARROW = '(max-width: 720px), (max-height: 500px)';

/** マウスのある端末か。**焦点を移してよいかの決め** (指の端末ではキーボードが出る)。 */
export const isFine = (): boolean => window.matchMedia('(pointer: fine)').matches;

/**
 * 図だけを出す形にするか。**アプリと、狭い画面。**
 *
 * 狭い画面では図に幅が残らないので、帯を 1 段に畳んで残りを図に渡す
 * (52 の docs/46)。広い画面は見出し → 帯 → マップ → 気に入ったら の頁のまま。
 * 頁として開いた人には、狭くても見出しと「気に入ったら」を 1 行ずつ残す
 * (CSS の `body.full:not(.app)`。52 の docs/48)。
 */
function syncFull(): void {
  document.body.classList.toggle('full', asApp() || window.matchMedia(NARROW).matches);
}

/**
 * 姿を決める。アプリ (ホーム画面) は、見出しと「気に入ったら」も畳む (docs/35)。
 * **幅が変わったら畳み方も変える** — 横向きにした・窓を広げたときに、
 * 畳んだままだとフェンスの字へ戻れない。
 */
export function startLayout(): void {
  if (asApp()) document.body.classList.add('app');
  syncFull();
  window.matchMedia(NARROW).addEventListener('change', syncFull);
}

const isFull = (): boolean => document.body.classList.contains('full');

/**
 * `≡` の板。**たまにしか押さないものを畳む** (52 の docs/46)。
 * 保存と Markdown は畳まない — 保存が 2 タップになるのが一番困る。
 */
export function showSheet(open: boolean): void {
  document.body.classList.toggle('sheet', open);
  els.more.setAttribute('aria-expanded', String(open));
  // 閉じたらログも畳む (次に開いたときに開きっぱなしだと板が長い)。
  if (!open) els.log.open = false;
}

const sheetOpen = (): boolean => document.body.classList.contains('sheet');

/**
 * 文書の名前を押したら、文書の一覧を開く。**名前が「いま何を開いているか」**
 * なので、そこが入口として自然 (実機で頼まれた)。
 *
 * 畳んだ姿では欄が板の中に隠れているので、**先に板を開いてから**呼ぶ
 * (隠れた欄には一覧を出せない)。`showPicker` を持たない窓では、板が開いた
 * ままになる — そこに欄があるので、もう 1 押しで開ける。
 */
function openExamplePicker(): void {
  if (isFull()) showSheet(true);
  const picker = els.example as HTMLSelectElement & { showPicker?: () => void };
  if (typeof picker.showPicker !== 'function') return;
  // **姿を確定させてから呼ぶ。** `showPicker` は「描かれている」ことを
  // 求める (隠れたままだと NotSupportedError)。板を開いた印を付けた直後は
  // まだ組み直していないので、ここで一度読んで確定させる。
  void picker.offsetHeight;
  try {
    picker.showPicker();
  } catch {
    // それでも出せない窓がある。板は開いたままにする — そこに欄がある。
  }
}

export function listenSheet(): void {
  els.more.addEventListener('click', () => { showSheet(!sheetOpen()); });
  els.docName.addEventListener('click', openExamplePicker);
  // **外を押したら閉じる。** 板の外の図を触ろうとしたときに、板が邪魔をしない。
  document.addEventListener('pointerdown', (event) => {
    if (!sheetOpen()) return;
    if (event.target instanceof Node && els.more.closest('.bar')?.contains(event.target)) return;
    showSheet(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') showSheet(false);
  });
}

/**
 * **iOS はピンチを gesture* で送ってくる。** マップ (iframe) の側では
 * 止められない — 頁ごと拡大するのは最上位のこちらなので、ここで断る。
 * 図の拡大は 2 本指でマップがやる (52 の docs/32)。
 * **Markdown の窓が開いているあいだは断らない** (52 の docs/48)。窓の図は
 * 画面の幅に縮めて出すので、込み入った回路は指で広げないと読めない —
 * 前は狭い画面でも頁の姿なら拡大できた。
 */
export function listenGestures(): void {
  for (const kind of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(kind, (event) => {
      if (isFull() && !els.mdBox.open) event.preventDefault();
    }, { passive: false });
  }
}

/**
 * 落としたものを控えて、電波が無くても開けるようにする。
 * **失敗しても頁は動く** — 控えは無くてもよいものなので、断られたら黙って進む
 * (対応していないブラウザ、`file://` で開いた人、私用ウィンドウ)。
 */
export function keepOffline(): void {
  if (!('serviceWorker' in navigator)) return;
  void navigator.serviceWorker.register('sw.js').catch(() => {});
}
