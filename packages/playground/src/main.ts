import { KINDS, KIND_LABEL, KIND_READING } from './kinds.ts';
import type { Kind } from './kinds.ts';
import { render } from './fences.ts';
import { decodeShare, encodeShare, shareHtml, shareLabel } from './share.ts';
import { forKind, parseExamples } from './examples.ts';
import { nudge, nudgesFor } from './demo.ts';
import type { Example } from './examples.ts';
import type { Output } from './fences.ts';
import { qrSvg } from './qr.ts';
import { SHORTS_URL, parseShorts, shortFor } from './shorts.ts';
import type { Shorts } from './shorts.ts';

/**
 * 画面を組み立てる層。**決め事はここに置かない** — 描画は `fences.ts`、
 * リンクの綴りは `share.ts`、例の受け取りは `examples.ts` にあり、
 * どれも DOM を知らない純関数としてテストに掛かっている。
 * ここがするのは、打鍵を読んで結果を DOM に映すことだけ。
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
  kinds: need('kinds'),
  example: need<HTMLSelectElement>('example'),
  share: need<HTMLButtonElement>('share'),
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
  qr: need<HTMLButtonElement>('qr'),
  qrBox: need<HTMLDialogElement>('qr-box'),
  qrUrl: need('qr-url'),
  qrKind: need('qr-kind'),
  qrCode: need('qr-code'),
};

/** 拡張の版。ビルドのときに焼き込む (`esbuild.mjs`)。 */
declare const __VERSION__: string;

let kind: Kind = 'breadboard';
let examples: readonly Example[] = [];

/**
 * わざと壊した例を欄に出すか。**`?dev` で開いた人だけ。**
 * あれはエラーの帯を確かめるためのもので、初めて来た人には雑音になる
 * (52 の docs/41)。`syncHash` は search を残すので、選んでも消えない。
 */
const showsBroken = new URLSearchParams(location.search).has('dev');

/**
 * いま出している例の**元の字**。「試す」で書き換えた後、元に戻すために持つ。
 * 手で打った字は元が無いので空 (そのときは戻す釦を出さない)。
 */
let pristine = '';

/** いま並べている例。**欄と `showExample` の番号を揃えるため 1 か所に置く。** */
const mine = (): readonly Example[] => forKind(examples, kind, showsBroken);

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
  const onLink = linked !== null && els.example.value === LINK_OPTION;
  els.leadLink.hidden = !onLink;
  els.leadJa.hidden = onLink || !JA;
  els.leadEn.hidden = onLink || JA;
  if (linked !== null) els.leadTitle.textContent = shareLabel(linked.kind, linked.source);
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
  const source = els.source.value;
  const rows = nudgesFor(kind, shareLabel(kind, source))
    .filter((one) => nudge(source, one) !== null);
  const back = pristine !== '' && source !== pristine;

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
      const next = nudge(els.source.value, one);
      // 押した瞬間に当たらなくなっていたら何もしない (欄を手で直した後)。
      if (next === null) return;
      els.source.value = next;
      paint();
      syncHash();
      map?.refresh();
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
    els.source.value = pristine;
    paint();
    syncHash();
    map?.refresh();
    say('例の字に戻した');
  });
  els.try.append(undo);
}

function paint(): void {
  const output = render(kind, els.source.value);

  // SVG は各コアが**それ自体で完結した形**で返し、フェンスから来た字は
  // 組む前にエスケープしてある (拡張のプレビューも同じものを貼っている)。
  els.figure.innerHTML = output.svg;

  // circuit だけは図が非同期で来る。**種類を変えた時点で番号を進めて**、
  // 描きかけの図が後から割り込まないようにする。
  if (kind === 'circuit') {
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
    kind,
    frame: els.map,
    body: () => els.source.value,
    setBody: (next) => {
      els.source.value = next;
      paint();
      syncHash();
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

/**
 * 種類か中身が丸ごと入れ替わったときに、開いているマップを開き直す。
 * **文法ごとに別のマップ**なので、開いたまま種類を変えると前の盤面が残る
 * (共有リンクを貼られたときに実際に残った)。
 */
function reopenMap(): void {
  if (map === null) return;
  closeMap();
  toggleMap();
}

function syncHash(): void {
  const source = els.source.value;
  const hash = source.trim() === '' ? '' : `#${encodeShare(kind, source)}`;
  // 打鍵のたびに履歴を積むと「戻る」が使えなくなるので、置き換える。
  history.replaceState(null, '', `${location.pathname}${location.search}${hash}`);
}

/**
 * 帯に一言。**`holds` を立てると消えない** — 読めなかったリンクの断りは、
 * 2 秒で消すと「別の図が出ている」ことに気づけないまま終わる。
 */
function say(text: string, holds = false): void {
  els.said.textContent = text;
  if (holds) return;
  window.setTimeout(() => {
    if (els.said.textContent === text) els.said.textContent = '';
  }, 2_000);
}

/**
 * リンクで来た図。**例の欄に題を出すために覚えておく。**
 *
 * これが無いと、共有リンクで開いた人の欄は空のままになる。1 行を丸ごと
 * 使う欄が空だと壊れて見えるうえ、**選び直して戻る道も無い** (例を 1 つ
 * 選んだら、リンクの図には二度と戻れなかった)。
 */
let linked: { readonly kind: Kind; readonly source: string } | null = null;

/** リンクの図を指す値。例は番号なので、字にしておけば混ざらない。 */
const LINK_OPTION = 'link';

/** 例を選ぶ欄。まともな例とわざと壊した例を分けて並べる。 */
/** 例の出どころのファイル名 (`.../examples/01-led.md` → `01-led`)。 */
const fileOf = (from: string): string =>
  (from.split('/').pop() ?? from).replace(/\.[^.]+$/, '');

/**
 * 例の選び手を組む。**出どころのファイルごとに小見出しを付ける。**
 *
 * 図の番号は `.md` ごとに 01 から数え直す約束なので、平らに並べると
 * 「図01」が何度も出て、どれがどれだか分からない (実機で「図の番号が
 * 重複している」)。番号の付け方は文書の側の決めなので変えず、
 * **出どころで括って**見分けられるようにする。
 */
function fillExamples(): void {
  const list = mine();
  els.example.replaceChildren();

  // **リンクで来た図は一番上。** 題は貼るときと同じ読み方をする
  // (`shareLabel`) ので、送った人が見た札とここの札が揃う。
  if (linked !== null && linked.kind === kind) {
    const option = document.createElement('option');
    option.value = LINK_OPTION;
    option.textContent = shareLabel(linked.kind, linked.source);
    const group = document.createElement('optgroup');
    group.label = 'リンクで開いた図';
    group.append(option);
    els.example.append(group);
  }

  for (const [broken, label] of [
    [false, '例'],
    [true, 'わざと壊した例'],
  ] as const) {
    // ファイルの並びは JSON のまま (作る側が並べてある)。
    const files: string[] = [];
    const rows = new Map<string, HTMLOptionElement[]>();
    for (const [index, example] of list.entries()) {
      if (example.broken !== broken) continue;
      const file = fileOf(example.from);
      if (!rows.has(file)) { rows.set(file, []); files.push(file); }
      const option = document.createElement('option');
      option.value = String(index);
      option.textContent = example.label;
      rows.get(file)?.push(option);
    }
    for (const file of files) {
      const group = document.createElement('optgroup');
      group.label = broken ? `${label} — ${file}` : file;
      group.append(...(rows.get(file) ?? []));
      els.example.append(group);
    }
  }
  // 例が 1 本も無くても、リンクの札があるなら欄は生かす (題を出す場所)。
  els.example.disabled = list.length === 0 && els.example.options.length === 0;
}

/**
 * いま出しているフェンスの出どころ。**共有リンクで来たときは消す** —
 * 前に選んだ例を指したままだと、別のフェンスの出どころとして読まれる。
 */
function showFrom(example: Example | null): void {
  els.from.replaceChildren();
  // リンクの図には出どころのファイルが無いので、行ごと消す。
  // **選びは動かさない** — 欄はリンクの札を選んだままにする。
  if (example === null) return;

  const link = document.createElement('a');
  link.href = `${REPO}/${example.from}`;
  link.textContent = example.from;
  els.from.append('この例の出どころ: ', link);
}

/** リンクで来た図を出し直す。欄でその札を選んだときの行き先。 */
function showLinked(): void {
  if (linked === null) return;
  els.source.value = linked.source;
  pristine = linked.source;
  map?.refresh();
  els.example.value = LINK_OPTION;
  showFrom(null);
  syncLead();
  paint();
  syncHash();
}

function showExample(index: number): void {
  const example = mine()[index];
  if (example === undefined) return;

  els.source.value = example.source;
  pristine = example.source;
  map?.refresh();
  els.example.value = String(index);
  showFrom(example);
  syncLead();
  paint();
  syncHash();
}

/** どのタブが選ばれているかを画面に映す。 */
function markKind(): void {
  for (const button of els.kinds.querySelectorAll('button')) {
    button.setAttribute('aria-pressed', String(button.dataset.kind === kind));
  }
}

function setKind(next: Kind): void {
  kind = next;
  markKind();
  fillExamples();
  // 文法が別なので、種類を変えたらその言語の最初の例に入れ替える。
  showExample(0);
  reopenMap();
}

function buildKinds(): void {
  for (const name of KINDS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.kind = name;
    // **綴りと呼び名を別の字にする。** 狭い画面では呼び名だけ畳んで、
    // 3 つを 1 行に収める (綴りはフェンスに書く字なので畳めない)。
    button.append(KIND_LABEL[name]);
    const reading = document.createElement('span');
    reading.className = 'reading';
    reading.textContent = `（${KIND_READING[name]}）`;
    button.append(reading);
    button.setAttribute('aria-pressed', String(name === kind));
    button.addEventListener('click', () => setKind(name));
    els.kinds.append(button);
  }
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
      paint();
      syncHash();
      // 手で書き換えたときもマップを組み直す (拡張と同じ)。
      map?.refresh();
    }, QUIET_MS);
  });

  els.example.addEventListener('change', () => {
    if (els.example.value === LINK_OPTION) showLinked();
    else showExample(Number(els.example.value));
  });
  els.mapToggle.addEventListener('click', toggleMap);

  // **共有リンクを、開いたままの頁に貼られたとき。** ハッシュだけの移動は
  // 頁を読み込み直さないので、ここで拾わないと何も起きない (実際に踏んだ)。
  // `syncHash` は replaceState なのでこれを鳴らさない (打鍵では回らない)。
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

    linked = { kind: shared.kind, source: shared.source };
    if (shared.kind !== kind) {
      kind = shared.kind;
      markKind();
    }
    // 種類が同じでも組み直す — **札の題が変わっている**ため。
    fillExamples();
    els.source.value = shared.source;
    pristine = shared.source;
    showFrom(null);
    els.example.value = LINK_OPTION;
    syncLead();
    paint();
    reopenMap();
  });

  els.qr.addEventListener('click', showQr);
  els.qrBox.addEventListener('close', () => { els.qr.setAttribute('aria-expanded', 'false'); });
  els.share.addEventListener('click', () => { void copyLink(); });
}

/**
 * リンクを写す。**題名付きで写す** — 貼った先が生の URL を出さないように
 * するのが狙いで、リンクを短くする話とは別 (52 の docs/38)。
 *
 * `text/html` と `text/plain` を**両方**置く。リッチテキストを受ける相手
 * (Gmail・Slack・Notion など) には題だけが見え、プレーンテキストしか
 * 受けない相手には今までどおり URL が渡る。
 *
 * **`ClipboardItem` が無ければ URL だけ写す。** 題が付かないだけで、
 * 渡せるものは変わらない。
 */
async function copyLink(): Promise<void> {
  syncHash();
  const url = location.href;
  const label = shareLabel(kind, els.source.value);
  try {
    if (typeof ClipboardItem === 'function') {
      await navigator.clipboard.write([new ClipboardItem({
        'text/html': new Blob([shareHtml(url, label)], { type: 'text/html' }),
        'text/plain': new Blob([url], { type: 'text/plain' }),
      })]);
    } else {
      await navigator.clipboard.writeText(url);
    }
    say(`コピーしました: ${label}`);
  } catch {
    say('コピーできませんでした (アドレス欄から取ってください)');
  }
}

/**
 * この頁の URL を QR で出す。**開くたびに組み直す** — 例を選ぶたびに
 * `#` が変わるので、覚えておくと前の頁の QR を出すことになる。
 */
/**
 * 短縮リンクの表。**QR を開いたときに 1 度だけ取りに行く。**
 * 押さない人には落とさせない (資材を要るときだけ落とす、と同じ考え)。
 * 取れなければ空の表 — 長い URL のまま出すだけで、頁は動く。
 */
let shorts: Promise<Shorts> | null = null;

const loadShorts = (): Promise<Shorts> => {
  shorts ??= fetch(SHORTS_URL)
    .then((response) => (response.ok ? response.json() : null))
    .then((data: unknown) => parseShorts(data))
    .catch(() => parseShorts(null));
  return shorts;
};

/** QR を 1 枚描く。**入らない長さのときは、そう言う。** */
function drawQr(url: string, was: string | null): void {
  els.qrUrl.textContent = url;
  const drawn = qrSvg(url);
  els.qrCode.innerHTML = drawn ?? '';
  els.qrCode.hidden = drawn === null;

  els.qrKind.hidden = was === null;
  if (was !== null) els.qrKind.textContent = `短縮リンク (元の URL は ${was.length} 字)`;

  if (drawn === null) say('この長さは QR に入りません (リンクをコピーしてください)');
}

/**
 * この頁の QR。**短縮リンクがあれば、そちらを入れる** (52 の docs/42)。
 *
 * 表を待たずに長い URL で先に描く — 表は別の出所から取るので、待つと
 * 窓が空のまま止まって見える。取れたら描き直す。
 */
function showQr(): void {
  syncHash();
  const url = location.href;
  drawQr(url, null);
  els.qrBox.showModal();
  els.qr.setAttribute('aria-expanded', 'true');

  void loadShorts().then((table) => {
    // 閉じられた・別の図に移った後の結果は捨てる (窓の中身が食い違う)。
    if (!els.qrBox.open || location.href !== url) return;
    const short = shortFor(url, table);
    if (short !== null) drawQr(short, url);
  });
}

async function start(): Promise<void> {
  els.ver.textContent = __VERSION__;
  document.documentElement.lang = JA ? 'ja' : 'en';
  els.leadNoteJa.hidden = !JA;
  els.leadNoteEn.hidden = JA;
  syncLead();
  buildKinds();
  listen();

  // 共有リンクで来た人には、例が届く前に、そのフェンスを出す。
  const shared = decodeShare(location.hash);
  const opened = shared !== null && shared.ok;
  if (shared !== null && shared.ok) {
    kind = shared.kind;
    linked = { kind: shared.kind, source: shared.source };
    els.source.value = shared.source;
    pristine = shared.source;
    markKind();
    showFrom(null);
    paint();
  }

  await loadExamples();
  // **例を埋めたあとに選ぶ。** `fillExamples` は欄を作り直すので、先に
  // 選んでも最初の例に戻ってしまう (リンクの中身と札が食い違う)。
  if (!opened) showExample(0);
  else {
    els.example.value = LINK_OPTION;
    syncLead();
  }

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
