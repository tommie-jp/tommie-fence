import { docFrom } from './files.ts';
import { renderTry } from './page/demo.ts';
import { els } from './page/els.ts';
import { listenExamples, loadExamples, openFirstExample, unpickExample } from './page/examples.ts';
import { listenFiles, openShared, openUrl } from './page/files.ts';
import { applyLanguage, showDocName, showFrom, syncLead } from './page/labels.ts';
import { keepOffline, listenGestures, listenSheet, startLayout } from './page/layout.ts';
import { note, renderLog, warn } from './page/log.ts';
import { refreshMap, showMap } from './page/map.ts';
import { fillFences, isMarkdownOpen, listenMarkdown, pickFence } from './page/markdown.ts';
import { paintFence } from './page/paint.ts';
import { listenQr } from './page/qr.ts';
import { showWhere } from './page/where.ts';
import { onChange, ws } from './page/workspace.ts';
import type { Change } from './page/workspace.ts';

/**
 * 頁を組み立てる層。**決め事はここに置かない** — 描画は `fences.ts`、
 * 文書の数え方は `document.ts` と `workspace.ts`、リンクの読みは `share.ts`、
 * 一覧は `examples.ts` にあり、どれも DOM を知らない純関数としてテストに
 * 掛かっている。DOM を触る配線は `page/` に役ごとに分けてあり (52 の docs/49)、
 * ここがするのは**文書に何かが起きたら映す** (`sync`) ことと、開いたときの支度だけ。
 *
 * **持っているのは Markdown の文書 1 つ** (52 の docs/43)。フェンスは
 * その中の範囲で、図に出すのは「いまのフェンス」1 本。
 */

/** 拡張の版。ビルドのときに焼き込む (`esbuild.mjs`)。 */
declare const __VERSION__: string;
/** いつ組んだか。同じく焼き込む。 */
declare const __BUILT__: string;

/** 出来事の種類ごとに、何を組み直すか。 */
type Plan = {
  /** フェンスの選び手を組み直す (`rebuild`)、いまのものに合わせるだけ (`value`)、触らない (`keep`)。 */
  readonly fences: 'rebuild' | 'value' | 'keep';
  /** 図を描き直すか。 */
  readonly figure: boolean;
  /** マップを組み直すか。**殻の側から来た変化では組み直さない** (堂々巡りになる)。 */
  readonly map: boolean;
};

/** **種類を足したら、ここに 1 行足さないと型が通らない** (呼び漏らしを型で防ぐ)。 */
const PLAN: Record<Change, Plan> = {
  open: { fences: 'rebuild', figure: true, map: true },
  text: { fences: 'rebuild', figure: true, map: true },
  replace: { fences: 'rebuild', figure: true, map: false },
  select: { fences: 'value', figure: true, map: true },
  bind: { fences: 'value', figure: true, map: false },
  view: { fences: 'keep', figure: true, map: false },
  kept: { fences: 'keep', figure: false, map: false },
};

/**
 * 文書に何かが起きたら映す。**呼び手ごとに組み直す所を選ばない** —
 * 何が起きたかだけを受けて、上の表で 1 通りに揃える (`page/workspace.ts`)。
 */
function sync(kind: Change): void {
  const plan = PLAN[kind];
  if (plan.fences === 'rebuild') fillFences();
  else if (plan.fences === 'value') pickFence();

  // 窓が閉じているあいだ、図と「試す」は描かない (開いたときに `view` で描く)。
  const open = isMarkdownOpen();
  if (plan.figure) paintFence(ws.current(), { open, hasDoc: ws.doc.name !== '' });
  if (open) renderTry();
  showDocName(ws.doc, ws.dirty());
  if (plan.map) refreshMap();

  if (kind !== 'open') return;
  showFrom(ws.doc);
  syncLead(ws.doc);
  showWhere();
  // **例ではない文書を開いたら、例の欄は何も指さない** (指したままにすると嘘になる)。
  if (ws.doc.from === null) unpickExample();
  // **開いたことは 1 か所で記録する。** 呼び手ごとに書くと二重に並ぶ。
  note(`${ws.doc.name} を開きました`);
}

/**
 * **共有リンクを、開いたままの頁に貼られたとき。** ハッシュだけの移動は
 * 頁を読み込み直さないので、ここで拾わないと何も起きない (実際に踏んだ)。
 * 頁の側から `#` を書くことはもう無いので、鳴るのは人が貼ったときだけ。
 */
function listenHash(): void {
  window.addEventListener('hashchange', () => {
    const shared = openShared(location.hash);
    // 共有リンクでないハッシュ (ただの `#見出し`) には何も言わない。
    // **読めないリンクは黙って捨てない** — 渡した相手には「前の図のまま何も
    // 起きない」としか見えない。
    if (shared !== null && !shared.ok) warn(shared.why);
  });
}

/**
 * 最初の文書を開く。**`?doc=` が最優先** (あれが文書を名指すもので、`#` は
 * 図 1 枚の旧い形)。どちらも無ければ既定の例。
 */
async function openFirst(): Promise<void> {
  // 共有リンクで来た人には、一覧が届く前に、その図を出す。
  const shared = openShared(location.hash);
  let opened = shared?.ok === true;

  const asked = docFrom(location.search, location.href);
  if (asked !== null) opened = await openUrl(asked) || opened;

  // **一覧を埋めたあとに開く** (既定の例は一覧から引く)。
  await loadExamples();
  if (!opened) await openFirstExample();

  // **読めなかったリンクは、既定の例を出したあとに言う。** 先に言うと
  // 開いたときの一言に上書きされる。
  if (shared !== null && !shared.ok) warn(`${shared.why} (既定の例を出しています)`);
}

async function start(): Promise<void> {
  els.ver.textContent = __VERSION__;
  applyLanguage();
  // **どの版を見ているかをログの頭に置く。** 配りかたが終わる前に見て
  // 「直っていない」と読む取り違えを 3 度踏んだ (52 の docs/46)。
  note(`ver ${__VERSION__} build ${__BUILT__}`);
  renderLog();
  syncLead(ws.doc);
  onChange(sync);

  // **姿は先に決める。** 中身を取りに行くあいだ、狭い画面が広い画面の姿で
  // 出ないように (姿は画面の大きさだけで決まり、中身を待つ理由が無い)。
  startLayout();

  listenMarkdown();
  listenExamples();
  listenFiles();
  listenQr();
  listenSheet();
  listenGestures();
  listenHash();

  await openFirst();

  // **マップを開くのは中身が決まってから** (先に開くと空の図になり、例が
  // 届いたところで組み直す)。頁は editor から始まる (52 の docs/48)。
  void showMap();
  keepOffline();
}

void start();
