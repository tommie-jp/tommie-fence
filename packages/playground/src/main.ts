import { KIND_LABEL, KIND_READING } from './kinds.ts';
import type { Kind } from './kinds.ts';
import { render } from './fences.ts';
import { decodeShare } from './share.ts';
import { parseExamples, shown } from './examples.ts';
import { nudge, nudgesFor } from './demo.ts';
import { asDocument, fenceAt, fencesIn, labelOf, lineOfOffset, replaceFence } from './document.ts';
import { UNTITLED, asTyped, canHold, canSend, docFrom, isCrlf, linkTo, nameOf, withNewlines } from './files.ts';
import { qrSvg } from './qr.ts';
import type { FileHandle } from './files.ts';
import type { DocFence } from './document.ts';
import type { Example } from './examples.ts';
import type { Output } from './fences.ts';

/**
 * 画面を組み立てる層。**決め事はここに置かない** — 描画は `fences.ts`、
 * 文書の数え方は `document.ts`、リンクの読みは `share.ts`、一覧は
 * `examples.ts` にあり、どれも DOM を知らない純関数としてテストに掛かっている。
 * ここがするのは、打鍵を読んで結果を DOM に映すことだけ。
 *
 * **持っているのは Markdown の文書 1 つ** (52 の docs/43)。フェンスは
 * その中の範囲で、図に出すのは「いまのフェンス」1 本。
 */

const REPO = 'https://github.com/tommie-jp/tommie-fence/blob/main';
/** 打鍵のたびに描くと重い図で引っかかるので、少し待ってからまとめて描く。 */
const QUIET_MS = 150;

function need<E extends HTMLElement>(id: string): E {
  const found = document.getElementById(id);
  if (found === null) throw new Error(`#${id} が index.html にありません`);
  return found as E;
}

const els = {
  example: need<HTMLSelectElement>('example'),
  fence: need<HTMLSelectElement>('fence'),
  docName: need('doc-name'),
  file: need<HTMLInputElement>('file'),
  open: need<HTMLButtonElement>('open'),
  save: need<HTMLButtonElement>('save'),
  qr: need<HTMLButtonElement>('qr'),
  qrBox: need<HTMLDialogElement>('qr-box'),
  qrUrl: need('qr-url'),
  qrKind: need('qr-kind'),
  qrCode: need('qr-code'),
  more: need<HTMLButtonElement>('more'),
  log: need<HTMLDetailsElement>('log'),
  logRows: need('log-rows'),
  said: need('said'),
  source: need<HTMLTextAreaElement>('source'),
  figure: need('figure'),
  try: need('try'),
  note: need('note'),
  tex: need<HTMLDetailsElement>('tex'),
  texBody: need('tex-body'),
  netlist: need('netlist'),
  messages: need('messages'),
  from: need('from'),
  map: need<HTMLIFrameElement>('map'),
  mapToggle: need<HTMLButtonElement>('map-toggle'),
  ver: need('ver'),
  leadJa: need('lead-ja'),
  leadEn: need('lead-en'),
  leadLink: need('lead-link'),
  leadTitle: need('lead-title'),
  leadNoteJa: need('lead-note-ja'),
  leadNoteEn: need('lead-note-en'),
};

/** 拡張の版。ビルドのときに焼き込む (`esbuild.mjs`)。 */
declare const __VERSION__: string;
/** いつ組んだか (UTC の「日 時分」)。同じく焼き込む。 */
declare const __BUILT__: string;

/** いま開いている文書。**フェンスではなく Markdown の全文**を持つ。 */
type Doc = {
  /** ファイル名 (`01-led.md`)。 */
  readonly name: string;
  /** 見出し。画面に出す名前。 */
  readonly title: string;
  /** リポジトリの中の置き場。例のときだけ (出どころのリンクに使う)。 */
  readonly from: string | null;
  /**
   * **その文書がどこにあるか。** 例と `?doc=` にはあり、手元のファイルには
   * 無い (ディスクの上にしか無く、相手の端末には存在しない)。
   * アドレス欄と QR がこれを指す。
   */
  readonly url: string | null;
  /** 配ってあるリンクから開いたか。 */
  readonly fromLink: boolean;
  /** 開いたときが CRLF だったか。**書き戻すときに揃える。** */
  readonly crlf: boolean;
};

let doc: Doc = { name: '', title: '', from: null, url: null, fromLink: false, crlf: false };
/** 開いたときの全文。「元に戻す」の行き先。 */
let pristine = '';
/** いまの文書のフェンス。**欄の字が正**なので、変わるたびに数え直す。 */
let here: readonly DocFence[] = [];
/** いま図に出しているフェンスの番号。 */
let at = 0;

let examples: readonly Example[] = [];

/**
 * わざと壊した例を欄に出すか。**`?dev` で開いた人だけ。**
 * あれはエラーの帯を確かめるためのもので、初めて来た人には雑音になる
 * (52 の docs/41)。`?dev` は URL の問い合わせに残るので、選んでも消えない。
 */
const showsBroken = new URLSearchParams(location.search).has('dev');

/** いま並べている例。**欄と `openExample` の番号を揃えるため 1 か所に置く。** */
const mine = (): readonly Example[] => shown(examples, showsBroken);

/** いま図に出しているフェンス。無ければ null (フェンスの無い文書)。 */
const now = (): DocFence | null => here[at] ?? null;

/**
 * 一文をどちらの言語で出すか。**片方だけ出す** — 2 つ並べると、読めない
 * ほうの行が図を 1 行ぶん押し下げる (52 の docs/41)。
 * 字は両方 HTML にあるので、するのは hidden の切り替えだけ。
 */
const JA = navigator.language.startsWith('ja');

/**
 * 見出しの下の一文。**リンクの図を出しているあいだは、その図の題**にする。
 *
 * 「Markdown に書くと〜」は初めて来た人への案内。リンクを受けた人はもう
 * 図を見に来ているので、開いたものが何かを先に言うほうがよい
 * (52 の docs/41)。例を選び直したら案内に戻る。
 */
function syncLead(): void {
  els.leadLink.hidden = !doc.fromLink;
  els.leadJa.hidden = doc.fromLink || !JA;
  els.leadEn.hidden = doc.fromLink || JA;
  if (doc.fromLink) els.leadTitle.textContent = doc.title;
}

const reason = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * 図の上に出す一言 (circuit の描画の進み具合と、描けなかった理由)。
 * null で消す。
 */
function showNote(text: string | null): void {
  els.note.hidden = text === null;
  els.note.textContent = text ?? '';
}

/**
 * **いま何枚目を描いているか。** 打鍵のたびに増える。描き上がったときに
 * 番号が変わっていたら、その図はもう古いので捨てる (TeX は 1 枚 1 秒前後かかる)。
 */
let drawing = 0;

/**
 * circuit の図。TeX を WASM で走らせるので**非同期**で、資材 (4.8 MB) は
 * 初めて描くときだけ落ちる。描き上がるまでは、前の図を消して一言だけ出す。
 */
const drawing0 = async (
  tex: string,
  finishing: NonNullable<Output['finishing']>,
  say: (text: string) => void,
): Promise<string> => {
  const { drawTex } = await import('./tex/index.ts');
  return drawTex(tex, finishing, say);
};

function paintCircuit(output: Output): void {
  const token = (drawing += 1);
  els.figure.replaceChildren();

  if (output.tex === null || output.finishing === null) {
    showNote('読めなかったので、図を組むところまで行けませんでした');
    return;
  }

  const say = (text: string): void => {
    if (token === drawing) showNote(text);
  };

  // **要るときに読む。** TeX を描く一式はここでしか使わないので、
  // breadboard と perfboard しか見ない人には落とさせない。
  drawing0(output.tex, output.finishing, say).then(
    (svg) => {
      if (token !== drawing) return;
      els.figure.innerHTML = svg;
      showNote(null);
    },
    (error: unknown) => {
      if (token !== drawing) return;
      showNote(`図を描けませんでした: ${reason(error)}`);
    },
  );
}

/** ネットリストを表にする。**中身は生のデータ**なので textContent で入れる。 */
function paintNetlist(netlist: readonly { name: string; refs: readonly string[] }[]): void {
  els.netlist.replaceChildren();
  if (netlist.length === 0) return;

  const table = document.createElement('table');
  const caption = document.createElement('caption');
  caption.textContent = 'ネットリスト (図から導いたもの)';
  table.append(caption);

  for (const net of netlist) {
    const row = document.createElement('tr');
    const name = document.createElement('th');
    name.scope = 'row';
    name.textContent = net.name;
    const refs = document.createElement('td');
    refs.textContent = net.refs.join(', ');
    row.append(name, refs);
    table.append(row);
  }
  els.netlist.append(table);
}

/**
 * 「試す」の帯。**当たる釦だけを出す** — 押しても何も起きない釦を並べると、
 * 触った人は「壊れている」と読む (`demo.ts` の `nudge` が null で教える)。
 */
function renderTry(): void {
  const fence = now();
  // **探すのはいまのフェンスの中だけ。** 文書の全文を探すと、別のフェンスの
  // 同じ字に当たって、見ていない図が変わる。
  const source = fence?.source ?? '';
  const rows = fence === null
    ? []
    : nudgesFor(fence.kind, fence.title ?? '').filter((one) => nudge(source, one) !== null);
  const back = pristine !== '' && els.source.value !== pristine;

  els.try.replaceChildren();
  els.try.hidden = rows.length === 0 && !back;
  if (els.try.hidden) return;

  const lead = document.createElement('span');
  lead.textContent = '試す:';
  els.try.append(lead);

  for (const one of rows) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = one.label;
    button.addEventListener('click', () => {
      const target = now();
      if (target === null) return;
      const next = nudge(target.source, one);
      // 押した瞬間に当たらなくなっていたら何もしない (欄を手で直した後)。
      if (next === null) return;
      setText(replaceFence(els.source.value, target, next));
      // **欄に焦点は移さない** — スマホでキーボードが出て図が隠れる。
      say(one.said);
    });
    els.try.append(button);
  }

  if (!back) return;
  const undo = document.createElement('button');
  undo.type = 'button';
  undo.className = 'back';
  undo.textContent = '元に戻す';
  undo.addEventListener('click', () => {
    setText(pristine);
    say('開いたときの字に戻した');
  });
  els.try.append(undo);
}

/** 描くものが無いとき (フェンスの無い文書) の姿。 */
function paintEmpty(): void {
  drawing += 1;
  els.figure.replaceChildren();
  els.tex.hidden = true;
  paintNetlist([]);
  els.messages.hidden = true;
  showNote(doc.name === ''
    ? null
    : 'この文書に circuit / breadboard / perfboard のフェンスがありません');
  renderTry();
  showDocName();
}

/** **いまのフェンス 1 本**を描く。文書の他の行は図に出ない。 */
function paint(): void {
  const fence = now();
  if (fence === null) {
    paintEmpty();
    return;
  }

  const output = render(fence.kind, fence.source);

  // SVG は各コアが**それ自体で完結した形**で返し、フェンスから来た字は
  // 組む前にエスケープしてある (拡張のプレビューも同じものを貼っている)。
  els.figure.innerHTML = output.svg;

  // circuit だけは図が非同期で来る。**別のフェンスへ移った時点で番号を進めて**、
  // 描きかけの図が後から割り込まないようにする。
  if (fence.kind === 'circuit') {
    paintCircuit(output);
  } else {
    drawing += 1;
    showNote(null);
  }

  els.tex.hidden = output.tex === null;
  els.texBody.textContent = output.tex ?? '';

  paintNetlist(output.netlist);

  els.messages.hidden = output.messages.length === 0;
  els.messages.textContent = output.messages.join('\n\n');

  renderTry();
  showDocName();
}

/**
 * 図を掴んで動かすマップ。**拡張と同じ殻**を iframe の中で動かすので、
 * 一式が要るのは開いたときだけ (`import()` で別のかたまりにする)。
 */
let map: { refresh: () => void; close: () => void } | null = null;

function closeMap(): void {
  map?.close();
  map = null;
  els.map.hidden = true;
  els.mapToggle.setAttribute('aria-pressed', 'false');
  syncFull();
}

async function showMap(): Promise<void> {
  const { openMap } = await import('./map/index.ts');
  // 開くまでの間に閉じられていたら、そのまま何もしない。
  if (els.mapToggle.getAttribute('aria-pressed') !== 'true') return;

  els.map.hidden = false;
  map = openMap({
    frame: els.map,
    text: () => els.source.value,
    setText: (next) => {
      // **殻が書き換えたのは文書の全文。** 数え直して、いまのフェンスを描く。
      els.source.value = next;
      reread();
      paint();
    },
    fenceLine: () => now()?.line ?? 0,
    // 殻が中の帯へ出す一言も記録する (「R1 を a7 へ動かしました」など)。
    // **帯には出さない** — マップは自分の帯に出しているので、二重になる。
    onStatus: note,
    onBind: (line) => {
      // 殻の一覧で選び直されたら、頁の側も揃える。**組み直しは頼まない** —
      // 殻はもうそのフェンスを見ているので、呼ぶと堂々巡りになる。
      const found = here.findIndex((one) => one.line === line);
      if (found < 0 || found === at) return;
      at = found;
      els.fence.value = String(at);
      paint();
    },
  });
}

/**
 * 落としたものを控えて、電波が無くても開けるようにする。
 * **失敗しても頁は動く** — 控えは無くてもよいものなので、断られたら黙って進む
 * (対応していないブラウザ、`file://` で開いた人、私用ウィンドウ)。
 */
function keepOffline(): void {
  if (!('serviceWorker' in navigator)) return;
  void navigator.serviceWorker.register('sw.js').catch(() => {});
}

/**
 * ホーム画面から開いたか (PWA)。**iOS は `display-mode` を見ない**ので、
 * あちらの `navigator.standalone` も見る。
 */
const asApp = (): boolean => window.matchMedia('(display-mode: standalone)').matches
  || (navigator as Navigator & { standalone?: boolean }).standalone === true;

/**
 * 狭いと見なす幅。**マップの側の閾値と揃える** (`panelHtml` の 720px) —
 * ずれると、頁は畳んだのにマップは広いときの形、という食い違いが出る。
 */
const NARROW = '(max-width: 720px)';

/**
 * 図だけを出す形にするか。**アプリはいつも、頁は「狭いときの編集中」だけ。**
 *
 * 広い画面で畳むと、フェンスの字と出るものが同時に見られる今までの形が
 * 失われる。狭い画面ではそもそも図に幅が残らないので、畳んで図に渡す
 * (実機で「編集するを押したら、その部分だけを表示する」)。
 */
function syncFull(): void {
  const editing = els.mapToggle.getAttribute('aria-pressed') === 'true';
  document.body.classList.toggle('full', asApp() || (editing && window.matchMedia(NARROW).matches));
  // **開いているあいだは「閉じる」と言う。** 同じ釦が行きと帰りを兼ねるので、
  // 「編集する」のままだと、いま何を押せるのかが読めない。
  els.mapToggle.textContent = editing ? '閉じる' : 'GUI で編集';
}

/**
 * アプリとして開いたときの支度。**編集する所だけを出す** — 見出しも
 * フェンスの字も畳み、図は最初から開いておく (52 の docs/35)。
 * 畳み方は CSS の `body.full` が持つ。
 */
function startAsApp(): void {
  if (!asApp()) return;
  document.body.classList.add('app');
  els.mapToggle.setAttribute('aria-pressed', 'true');
  syncFull();
  void showMap();
}

function toggleMap(): void {
  if (map !== null || els.mapToggle.getAttribute('aria-pressed') === 'true') {
    closeMap();
    return;
  }
  els.mapToggle.setAttribute('aria-pressed', 'true');
  syncFull();
  void showMap();
}

// **マップは開き直さない。** 3 つの言語を一度に渡してあるので、別の言語の
// フェンスへ移っても殻の側で乗り換わる (52 の docs/43)。

/** この頁そのもの (問い合わせも `#` も無い形)。リンクを組む基準。 */
const pageUrl = (): string => `${location.origin}${location.pathname}`;

/**
 * アドレス欄を、いま開いている文書に合わせる。**URL は文書の中身ではなく、
 * 文書の置き場を指す** (52 の docs/43 / 44)。
 *
 * - 置き場のある文書 (例・`?doc=`) → `?doc=…`。読み込み直しても同じものが出る
 * - 手元のファイル → 頁の URL だけ。**指せるものが無い**
 * - 配ってあるリンクで来たとき → 来たときの `#` を残す (旧い形の読み)
 *
 * 履歴は積まない (打鍵のたびに戻れなくなるのを避けたのと同じ)。
 */
function showWhere(): void {
  const link = linkTo(pageUrl(), doc.url);
  const dev = showsBroken ? (link.includes('?') ? '&dev' : '?dev') : '';
  const hash = doc.fromLink ? location.hash : '';
  history.replaceState(null, '', `${link}${dev}${hash}`);
}

/**
 * 帯に一言。**`holds` を立てると消えない** — 読めなかったリンクの断りは、
 * 2 秒で消すと「別の図が出ている」ことに気づけないまま終わる。
 */
/**
 * 何が起きたかの記録。**一言は 2 秒で消えて、スマホでは見逃しやすい**
 * (52 の docs/45)。**残すのは最後の 20 行**で、読み込み直すと消える
 * (文書は外のファイルなので、そちらを見れば分かる)。
 */
const LOG_ROWS = 20;
const log: { readonly at: string; readonly text: string }[] = [];

const clock = (): string => new Date().toTimeString().slice(0, 5);

/** ログを組み直す。**新しいものが上**。 */
function renderLog(): void {
  els.logRows.replaceChildren();
  if (log.length === 0) {
    const none = document.createElement('li');
    none.className = 'none';
    none.textContent = 'まだ何も起きていません';
    els.logRows.append(none);
    return;
  }
  for (const row of [...log].reverse()) {
    const line = document.createElement('li');
    const at = document.createElement('time');
    at.textContent = row.at;
    line.append(at, row.text);
    els.logRows.append(line);
  }
}

/** 記録だけ足す (帯には出さない)。マップの帯へ出た一言もここへ落とす。 */
function note(text: string): void {
  log.push({ at: clock(), text });
  if (log.length > LOG_ROWS) log.shift();
  renderLog();
}

/**
 * 帯に一言。**`holds` を立てると消えない** — 読めなかったリンクの断りは、
 * 2 秒で消すと「別の図が出ている」ことに気づけないまま終わる。
 *
 * **ログにも書く。** 別の口を作ると、呼び忘れた出来事だけがログに出ない —
 * 出来事は 1 か所を通す (52 の docs/45)。
 */
function say(text: string, holds = false): void {
  note(text);
  els.said.textContent = text;
  if (holds) return;
  window.setTimeout(() => {
    if (els.said.textContent === text) els.said.textContent = '';
  }, 2_000);
}

/**
 * 開ける `.md` の一覧を組む。**種類ごとに小見出しを付ける** — 1 つの
 * 文書は 1 つの言語で書かれているので、束ねると探しやすい。
 */
function fillExamples(): void {
  const list = mine();
  els.example.replaceChildren();

  const groups = new Map<string, HTMLOptionElement[]>();
  const order: string[] = [];
  for (const [index, example] of list.entries()) {
    const label = example.broken
      ? `わざと壊した例 — ${KIND_LABEL[example.kind]}`
      : `${KIND_LABEL[example.kind]}（${KIND_READING[example.kind]}）`;
    if (!groups.has(label)) { groups.set(label, []); order.push(label); }

    const option = document.createElement('option');
    option.value = String(index);
    // **図が何本あるかを添える。** 1 本しか無い文書と、10 本ある文書とで
    // 開いたときの姿がまるで違う。
    option.textContent = example.fences > 1
      ? `${example.name} — ${example.title} (図 ${example.fences} 本)`
      : `${example.name} — ${example.title}`;
    groups.get(label)?.push(option);
  }
  for (const label of order) {
    const group = document.createElement('optgroup');
    group.label = label;
    group.append(...(groups.get(label) ?? []));
    els.example.append(group);
  }
  els.example.disabled = list.length === 0;
}

/** 文書の中のフェンスを並べる。**1 本しか無くても出す** (何を見ているかの札)。 */
function fillFences(): void {
  els.fence.replaceChildren();
  for (const [index, fence] of here.entries()) {
    const option = document.createElement('option');
    option.value = String(index);
    // 言語を添える。**1 つの `.md` に 2 つの言語が混ざる**ことがある。
    option.textContent = `${labelOf(fence)} — ${fence.kind}`;
    els.fence.append(option);
  }
  els.fence.disabled = here.length === 0;
  els.fence.value = String(at);
}

/** 開いてから直したか。**保存すると解ける** (`pristine` がそこへ進む)。 */
const dirty = (): boolean => doc.name !== '' && els.source.value !== pristine;

/**
 * いま開いている文書の名前。**直したままなら印を添える** — 頁を閉じると
 * 消えるので、直したことを画面から読み取れるようにしておく。
 */
function showDocName(): void {
  els.docName.replaceChildren();
  if (doc.name === '') return;
  els.docName.append(doc.name);
  if (!dirty()) return;
  const mark = document.createElement('span');
  mark.className = 'dirty';
  mark.textContent = ' — 直したまま';
  els.docName.append(mark);
}

/** いま開いている文書の出どころ。手元で開いたものには無い。 */
function showFrom(): void {
  els.from.replaceChildren();
  if (doc.from === null) return;

  const link = document.createElement('a');
  link.href = `${REPO}/${doc.from}`;
  link.textContent = doc.from;
  els.from.append('この例の出どころ: ', link);
}

/**
 * 欄の字を数え直す。**欄が正** — 打鍵でも、殻の書き換えでも、ここを通る。
 * いまのフェンスは**行で追う** (行数が変わっても同じフェンスを見続ける)。
 */
function reread(): void {
  const was = now();
  here = fencesIn(els.source.value);
  if (was !== null) {
    const same = here.findIndex((one) => one.kind === was.kind && one.title === was.title);
    at = same >= 0 ? same : Math.min(at, Math.max(0, here.length - 1));
  }
  if (at >= here.length) at = Math.max(0, here.length - 1);
  fillFences();
}

/** 欄の字を入れ替える (打鍵以外の道)。数え直して、図と殻を揃える。 */
function setText(next: string): void {
  els.source.value = next;
  reread();
  paint();
  map?.refresh();
}

/** 文書を開く。**ここが唯一の入口** — 例もリンクも手元のファイルも通る。 */
function openDoc(next: Doc, text: string): void {
  // **前の文書の掴み手は捨てる。** 残すと、別のファイルを上書きしてしまう。
  held = null;
  doc = next;
  pristine = text;
  at = 0;
  els.source.value = text;
  reread();
  showFrom();
  syncLead();
  paint();
  showWhere();
  map?.refresh();
  // **開いたことは 1 か所で記録する。** 呼び手ごとに書くと二重に並ぶ。
  note(`${doc.name} を開きました`);
}

/** 例 (`.md`) を開く。**中身はそのとき取りに行く** (一覧は名前だけ持つ)。 */
async function openExample(index: number): Promise<void> {
  const example = mine()[index];
  if (example === undefined) return;

  try {
    const response = await fetch(example.path);
    if (!response.ok) throw new Error(`${response.status} で返りました`);
    const text = await response.text();
    els.example.value = String(index);
    openText(example.name, text, {
      title: example.title,
      from: example.from,
      // **例も置き場のある文書。** 同じ URL を渡せば相手も同じものを開ける。
      url: new URL(example.path, pageUrl()).href,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    say(`${example.name} を開けませんでした: ${reason}`, true);
  }
}

/**
 * その場に書き戻せる掴み手。**持てたときだけ**入る (Chromium の PC)。
 * 文書を開き直すたびに落とす — 前の文書の掴み手に書くと、別のファイルを
 * 上書きすることになる。
 */
let held: FileHandle | null = null;

/**
 * 外の `.md` を開く。**開く口はどれもここへ来る** (釦・落とす・`?doc=`・例)。
 * 改行の形は開いたときのものを覚えておき、書き戻すときに揃える。
 */
function openText(name: string, text: string, over: Partial<Doc> = {}): void {
  const crlf = isCrlf(text);
  openDoc({
    name: name === '' ? UNTITLED : name,
    title: name,
    from: null,
    // **手元のファイルには置き場が無い。** 呼ぶ側が知っていれば渡す。
    url: null,
    fromLink: false,
    crlf,
    ...over,
  }, asTyped(text));
}

/** 手元のファイルを開く (釦でも、落としても、ここへ来る)。 */
async function openFile(file: File, handle: FileHandle | null = null): Promise<void> {
  try {
    openText(file.name, await file.text());
    // **開いた後に持たせる** (`openDoc` が掴み手を落とすので、順は逆にできない)。
    held = handle;
    if (handle !== null) say(`${file.name} は保存で上書きします`);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    say(`${file.name} を読めませんでした: ${reason}`, true);
  }
}

/** 窓の側の口。**lib.dom の版に頁の動きを預けない**ので、こちらで名を付ける。 */
type Picker = {
  showOpenFilePicker: (options?: unknown) => Promise<readonly FileHandle[]>;
};

/**
 * 掴み手ごと開く (File System Access)。**2 回目からは窓を出さずに上書き**
 * できる — 直す道具として当たり前の形。持てない窓では釦が `<input>` を押す。
 */
async function pickFile(): Promise<void> {
  try {
    const [handle] = await (window as unknown as Picker).showOpenFilePicker({
      types: [{ description: 'Markdown', accept: { 'text/markdown': ['.md', '.markdown'] } }],
    });
    if (handle === undefined) return;
    await openFile(await handle.getFile(), handle);
  } catch (error) {
    // **取り消しは何も言わない。** 人が閉じただけで、失敗ではない。
    if (error instanceof DOMException && error.name === 'AbortError') return;
    const reason = error instanceof Error ? error.message : String(error);
    say(`開けませんでした: ${reason}`, true);
  }
}

/**
 * `?doc=` の `.md` を開く。**取れなければそう言う** — 相手が CORS を
 * 許していないことがあり、黙って既定の例を出すと「別の文書が出た」としか
 * 見えない (約束 6)。
 */
async function openUrl(url: string): Promise<boolean> {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${response.status} で返りました`);
    openText(nameOf(url), await response.text(), { url });
    return true;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    say(`${url} を開けませんでした: ${reason}`, true);
    return false;
  }
}

/**
 * 書き戻す。**同じ名前で落とす** — 頁からその場のファイルへ書く道は、
 * ブラウザによっては無い (段 4 で `showOpenFilePicker` を足す)。
 * iOS はダウンロードが Files に落ちるので、そこから戻せる。
 */
async function saveDoc(): Promise<void> {
  if (doc.name === '') return;
  const typed = els.source.value;
  const text = withNewlines(typed, doc.crlf);

  if (held !== null) {
    try {
      const writable = await held.createWritable();
      await writable.write(text);
      await writable.close();
      kept(typed, `${doc.name} に書きました`);
      return;
    } catch (error) {
      // **書けなかったら落とす道へ。** 許しを取り消された・別の窓が掴んで
      // いる、などがある。黙って何も起きないのが一番困る。
      const reason = error instanceof Error ? error.message : String(error);
      say(`その場に書けませんでした (${reason})。落とします`, true);
      held = null;
    }
  }

  const file = new File([text], doc.name, { type: 'text/markdown' });

  // **保存先を知らせられないなら、選ばせる** (52 の docs/45)。
  // 掴み手を持てない窓 (iPhone など) で共有シートが使えるなら、そちらへ出す —
  // 「ファイルに保存」で人が場所を決めるので、**選んだ人が知っている**。
  // 掴み手を持てる窓では使わない (その場に書くほうが速い)。
  if (!canHold(window) && canSend(window, file)) {
    try {
      await navigator.share({ files: [file], title: doc.name });
      kept(typed, `${doc.name} を共有シートに出しました (保存先はそちらで選んでください)`);
      return;
    } catch (error) {
      // **取り消しは何も言わない。** 人が閉じただけで、失敗ではない。
      if (error instanceof DOMException && error.name === 'AbortError') return;
      const reason = error instanceof Error ? error.message : String(error);
      say(`共有シートに出せませんでした (${reason})。落とします`, true);
    }
  }

  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = doc.name;
  link.click();
  URL.revokeObjectURL(url);

  // **落とせたものとして扱う。** ブラウザは落とし終わりを教えないので、
  // ここで印を解く。**どこへ入ったかは言えない** (頁に教える API が無い) ので、
  // 代わりに**どこを見ればよいか**を言う。
  kept(typed, `${doc.name} をダウンロードに入れました (ブラウザの履歴から開けます)`);
}

/** 書き戻せたときの後始末。**「元に戻す」の行き先もここへ進む。** */
function kept(typed: string, message: string): void {
  pristine = typed;
  showDocName();
  renderTry();
  say(message);
}

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
  const link = linkTo(pageUrl(), doc.url);
  els.qrUrl.textContent = link;
  els.qrKind.textContent = doc.url === null
    ? `この頁を開くリンク (${doc.name === '' ? 'いまの文書' : doc.name} は手元にあるので渡せません)`
    : 'この文書を開くリンク';

  const drawn = qrSvg(link);
  els.qrCode.innerHTML = drawn ?? '';
  els.qrCode.hidden = drawn === null;
  if (drawn === null) say('この長さは QR に入りません', true);

  els.qrBox.showModal();
  els.qr.setAttribute('aria-expanded', 'true');
}

/** いまのフェンスを選び直す。 */
function showFence(index: number): void {
  if (index < 0 || index >= here.length || index === at) return;
  at = index;
  els.fence.value = String(index);
  paint();
  // 殻にも同じフェンスを見せる (カーソルの行が変わったことになる)。
  map?.refresh();
}

/**
 * 欄のカーソルが別のフェンスへ入ったら、そちらへ移る。**拡張と同じ決め方**
 * (カーソルのあるフェンスが「いまのフェンス」)。
 */
function follow(): void {
  const line = lineOfOffset(els.source.value, els.source.selectionStart);
  const found = fenceAt(here, line);
  // フェンスの外にカーソルがあるだけなら、見ているものは変えない。
  if (found >= 0) showFence(found);
}

async function loadExamples(): Promise<void> {
  try {
    const response = await fetch('examples.json');
    if (!response.ok) throw new Error(`examples.json が ${response.status} で返りました`);

    const { examples: found, dropped } = parseExamples(await response.json());
    examples = found;
    // **落とした数を黙らせない。** 頁と JSON の形が食い違っている印。
    if (dropped > 0) say(`例を ${dropped} 本読めませんでした`);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    els.messages.hidden = false;
    els.messages.textContent = `例を読み込めませんでした: ${reason}\n(フェンスは手で書けば動きます)`;
  }
  fillExamples();
}

function listen(): void {
  let timer = 0;
  els.source.addEventListener('input', () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      reread();
      follow();
      paint();
      // 手で書き換えたときもマップを組み直す (拡張と同じ)。
      map?.refresh();
    }, QUIET_MS);
  });

  // **カーソルのあるフェンスへ移る。** 打鍵は上で見ているので、動かすだけの
  // 出来事をここで拾う (押した・矢印で動かした)。
  els.source.addEventListener('click', follow);
  els.source.addEventListener('keyup', follow);

  els.example.addEventListener('change', () => {
    showSheet(false);
    void openExample(Number(els.example.value));
  });
  els.fence.addEventListener('change', () => { showFence(Number(els.fence.value)); });
  els.mapToggle.addEventListener('click', toggleMap);

  // **掴めるなら picker で開く** (2 回目からその場に上書きできる)。
  // 持てない窓 (iOS など) では今までどおり `<input>` を押す。
  /**
   * `···` の板。**たまにしか押さないものを畳む** (52 の docs/46)。
   * 保存と閉じるは畳まない — 保存が 2 タップになるのが一番困る。
   */
  const showSheet = (open: boolean): void => {
    document.body.classList.toggle('sheet', open);
    els.more.setAttribute('aria-expanded', String(open));
    // 閉じたらログも畳む (次に開いたときに開きっぱなしだと板が長い)。
    if (!open) els.log.open = false;
  };
  els.more.addEventListener('click', () => {
    showSheet(!document.body.classList.contains('sheet'));
  });
  // **外を押したら閉じる。** 板の外の図を触ろうとしたときに、板が邪魔をしない。
  document.addEventListener('pointerdown', (event) => {
    if (!document.body.classList.contains('sheet')) return;
    if (event.target instanceof Node && els.more.closest('.bar')?.contains(event.target)) return;
    showSheet(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') showSheet(false);
  });

  els.open.addEventListener('click', () => {
    if (canHold(window)) void pickFile();
    else els.file.click();
  });
  els.file.addEventListener('change', () => {
    const file = els.file.files?.[0];
    if (file !== undefined) void openFile(file);
    // **同じファイルをもう一度選べるようにする。** 値が同じだと change が
    // 鳴らないので、読み終わったら空に戻す。
    els.file.value = '';
  });
  els.save.addEventListener('click', () => { void saveDoc(); });
  els.qr.addEventListener('click', showQr);
  els.qrBox.addEventListener('close', () => { els.qr.setAttribute('aria-expanded', 'false'); });

  // **落として開く。** 受け皿は頁ぜんぶ (どこへ落としても同じ)。
  for (const kind of ['dragenter', 'dragover'] as const) {
    document.addEventListener(kind, (event) => {
      if (event.dataTransfer === null) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      document.body.classList.add('dropping');
    });
  }
  document.addEventListener('dragleave', (event) => {
    // 頁の外へ出たときだけ消す (中の要素をまたぐたびに鳴るため)。
    if (event.relatedTarget === null) document.body.classList.remove('dropping');
  });
  document.addEventListener('drop', (event) => {
    event.preventDefault();
    document.body.classList.remove('dropping');
    const item = event.dataTransfer?.items[0];
    const file = event.dataTransfer?.files[0];
    if (file === undefined) return;

    // **落としたものからも掴み手を取れる** (Chromium)。取れれば、そのまま
    // その場に書き戻せる。取れなければダウンロードに落ちるだけ。
    const asHandle = (item as { getAsFileSystemHandle?: () => Promise<FileHandle | null> } | undefined)
      ?.getAsFileSystemHandle;
    if (asHandle === undefined) {
      void openFile(file);
      return;
    }
    void asHandle.call(item).then(
      (handle) => openFile(file, handle),
      () => openFile(file),
    );
  });

  // **⌘S / Ctrl+S でも落とす。** 直す道具として当たり前の鍵で、押すと
  // ブラウザが「頁を保存」を出してしまうので、こちらで受け取る。
  document.addEventListener('keydown', (event) => {
    if (!(event.metaKey || event.ctrlKey) || event.key !== 's') return;
    event.preventDefault();
    void saveDoc();
  });

  // **直したまま閉じさせない。** 頁を閉じると字は消える (預け先が無い)。
  window.addEventListener('beforeunload', (event) => {
    if (!dirty()) return;
    event.preventDefault();
  });

  // **共有リンクを、開いたままの頁に貼られたとき。** ハッシュだけの移動は
  // 頁を読み込み直さないので、ここで拾わないと何も起きない (実際に踏んだ)。
  // 頁の側から `#` を書くことはもう無いので、鳴るのは人が貼ったときだけ。
  window.addEventListener('hashchange', () => {
    const shared = decodeShare(location.hash);
    // 共有リンクでないハッシュ (ただの `#見出し`) には何も言わない。
    if (shared === null) return;
    // **読めないリンクは黙って捨てない。** そのままだと、渡した相手には
    // 「前の図のまま何も起きない」としか見えない。
    if (!shared.ok) {
      say(shared.why, true);
      return;
    }

    openLink(shared.kind, shared.source);
  });
}

/**
 * 配ってあるリンクを開く。**フェンス 1 本を、それだけの文書に仕立てる** —
 * 以降の道は普通の `.md` と同じ (52 の docs/43)。
 */
function openLink(kind: Kind, source: string): void {
  const text = asDocument(kind, source);
  const fence = fencesIn(text)[0];
  els.example.selectedIndex = -1;
  openDoc({
    name: 'リンクの図.md',
    title: fence === undefined ? 'リンクの図' : labelOf(fence),
    from: null,
    url: null,
    fromLink: true,
    crlf: false,
  }, text);
}

async function start(): Promise<void> {
  els.ver.textContent = __VERSION__;
  document.documentElement.lang = JA ? 'ja' : 'en';
  els.leadNoteJa.hidden = !JA;
  els.leadNoteEn.hidden = JA;
  // **どの版を見ているかをログの頭に置く。** 配りかたが終わる前に見て
  // 「直っていない」と読む取り違えを 3 度踏んだ (52 の docs/46)。
  note(`版 ${__VERSION__}・${__BUILT__} に組んだもの`);
  renderLog();
  syncLead();
  listen();

  // 共有リンクで来た人には、一覧が届く前に、その図を出す。
  const shared = decodeShare(location.hash);
  let opened = shared !== null && shared.ok;
  if (shared !== null && shared.ok) openLink(shared.kind, shared.source);

  // **`?doc=` が最優先。** あれが文書を名指すもので、`#` は図 1 枚の旧い形。
  const asked = docFrom(location.search, location.href);
  if (asked !== null) opened = await openUrl(asked) || opened;

  await loadExamples();
  // **一覧を埋めたあとに開く。** 外から開いた人の欄は、どれも選ばない形に
  // する (開いているのは例ではないので、名前を指したままにすると嘘になる)。
  if (!opened) await openExample(0);
  else els.example.selectedIndex = -1;

  // **読めなかったリンクは、既定の例を出したあとに言う。** 先に言うと
  // `showExample` の一言に上書きされる。
  if (shared !== null && !shared.ok) say(`${shared.why} (既定の例を出しています)`, true);

  // **幅が変わったら畳み方も変える。** 横向きにした・窓を広げたときに、
  // 畳んだままだとフェンスの字へ戻れない。
  window.matchMedia(NARROW).addEventListener('change', syncFull);

  // **iOS はピンチを gesture* で送ってくる。** マップ (iframe) の側では
  // 止められない — 頁ごと拡大するのは最上位のこちらなので、ここで断る。
  // 図の拡大は 2 本指でマップがやる (52 の docs/32)。
  for (const kind of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(kind, (event) => {
      if (document.body.classList.contains('full')) event.preventDefault();
    }, { passive: false });
  }

  // **最後に支度する。** 図を開くのは中身が決まってから (先に開くと空の図に
  // なり、例が届いたところで組み直す)。
  startAsApp();
  keepOffline();
}

void start();
