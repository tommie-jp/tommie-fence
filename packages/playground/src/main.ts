import { KINDS, KIND_LABEL } from './kinds.ts';
import type { Kind } from './kinds.ts';
import { render } from './fences.ts';
import { decodeShare, encodeShare } from './share.ts';
import { forKind, parseExamples } from './examples.ts';
import type { Example } from './examples.ts';
import type { Output } from './fences.ts';

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
  note: need('note'),
  tex: need<HTMLDetailsElement>('tex'),
  texBody: need('tex-body'),
  netlist: need('netlist'),
  messages: need('messages'),
  from: need('from'),
  map: need<HTMLIFrameElement>('map'),
  mapToggle: need<HTMLButtonElement>('map-toggle'),
};

let kind: Kind = 'breadboard';
let examples: readonly Example[] = [];

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

function toggleMap(): void {
  if (map !== null || els.mapToggle.getAttribute('aria-pressed') === 'true') {
    closeMap();
    return;
  }
  els.mapToggle.setAttribute('aria-pressed', 'true');
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

function say(text: string): void {
  els.said.textContent = text;
  window.setTimeout(() => {
    if (els.said.textContent === text) els.said.textContent = '';
  }, 2_000);
}

/** 例を選ぶ欄。まともな例とわざと壊した例を分けて並べる。 */
function fillExamples(): void {
  const mine = forKind(examples, kind);
  els.example.replaceChildren();

  for (const [broken, label] of [
    [false, '例'],
    [true, 'わざと壊した例'],
  ] as const) {
    const group = document.createElement('optgroup');
    group.label = label;
    for (const [index, example] of mine.entries()) {
      if (example.broken !== broken) continue;
      const option = document.createElement('option');
      option.value = String(index);
      option.textContent = example.label;
      group.append(option);
    }
    if (group.childElementCount > 0) els.example.append(group);
  }
  els.example.disabled = mine.length === 0;
}

/**
 * いま出しているフェンスの出どころ。**共有リンクで来たときは消す** —
 * 前に選んだ例を指したままだと、別のフェンスの出どころとして読まれる。
 */
function showFrom(example: Example | null): void {
  els.from.replaceChildren();
  if (example === null) {
    // 例を選んでいない状態にする。選んだままだと、欄の名前と中身が食い違う。
    els.example.selectedIndex = -1;
    return;
  }

  const link = document.createElement('a');
  link.href = `${REPO}/${example.from}`;
  link.textContent = example.from;
  els.from.append('この例の出どころ: ', link);
}

function showExample(index: number): void {
  const example = forKind(examples, kind)[index];
  if (example === undefined) return;

  els.source.value = example.source;
  map?.refresh();
  els.example.value = String(index);
  showFrom(example);
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
    button.textContent = KIND_LABEL[name];
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

  els.example.addEventListener('change', () => showExample(Number(els.example.value)));
  els.mapToggle.addEventListener('click', toggleMap);

  // **共有リンクを、開いたままの頁に貼られたとき。** ハッシュだけの移動は
  // 頁を読み込み直さないので、ここで拾わないと何も起きない (実際に踏んだ)。
  // `syncHash` は replaceState なのでこれを鳴らさない (打鍵では回らない)。
  window.addEventListener('hashchange', () => {
    const shared = decodeShare(location.hash);
    if (shared === null) return;

    if (shared.kind !== kind) {
      kind = shared.kind;
      markKind();
      fillExamples();
    }
    els.source.value = shared.source;
    showFrom(null);
    paint();
    reopenMap();
  });

  els.share.addEventListener('click', () => {
    syncHash();
    navigator.clipboard.writeText(location.href).then(
      () => say('コピーしました'),
      () => say('コピーできませんでした (アドレス欄から取ってください)'),
    );
  });
}

async function start(): Promise<void> {
  buildKinds();
  listen();

  // 共有リンクで来た人には、例が届く前に、そのフェンスを出す。
  const shared = decodeShare(location.hash);
  if (shared !== null) {
    kind = shared.kind;
    els.source.value = shared.source;
    markKind();
    showFrom(null);
    paint();
  }

  await loadExamples();
  // **例を埋めたあとにもう一度**選びを外す。`fillExamples` は欄を作り直すので、
  // 先に外しても最初の例が選ばれた形に戻る (共有リンクの中身と食い違う)。
  if (shared === null) showExample(0);
  else els.example.selectedIndex = -1;
}

void start();
