import { DRAG, NOTHING, start, step, topOf } from './mapState.ts';
import type { Event, Focus, Picked, State, Under } from './mapState.ts';

/**
 * マップの webview の**DOM を触る側**。何が起きたかを読んで状態遷移
 * (`mapState.ts`) に渡し、返ってきたものを画面と拡張へ流すだけ。
 *
 * **ここは薄く保つ。** 決め事はすべて `mapState.ts` にあり、そちらは DOM も
 * vscode も知らない純関数として node のテストに掛かっている。ここにあるのは
 * DOM だけの話 — カーソルの下に何があるか (`elementsFromPoint`)、ズームとパン、
 * 選択窓の開け閉め、印の付け外し。
 *
 * webview は拡張が渡した HTML をサニタイズしないので、フェンスから来た字は
 * すべて拡張側でエスケープ済みのものだけを受け取る。
 */

declare function acquireVsCodeApi(): { postMessage: (message: unknown) => void };

const vscode = acquireVsCodeApi();

let state: State = start(
  document.body.classList.contains('cf-own-undo'),
  document.body.dataset.folds === '1',
);

/** 最後に見たカーソルの位置。組み直しのあとにカーソルの下を取り直す。 */
let pointer: { x: number; y: number } | null = null;

const query = <T extends Element>(selector: string): T | null => document.querySelector<T>(selector);

const setText = (selector: string, text: string): void => {
  const target = query(selector);
  if (target) target.textContent = text;
};

// ---------------------------------------------------------------- ズーム・パン

/** 図の見え方。**組み直しても保つ** (変形は図の外側の箱に掛ける)。 */
const view = { zoom: 1, x: 0, y: 0 };
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 8;
const WHEEL_STEP = 1.1;
const KEY_STEP = 1.25;

const canvas = (): HTMLElement | null => query<HTMLElement>('.kc-canvas');

function applyView(): void {
  const body = query<HTMLElement>('.cf-body');
  if (body) body.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`;
  setText('.kc-zoom', `${Math.round(view.zoom * 100)} %`);
}

/** カーソルの位置を中心にズーム (その点が動かないように平行移動を直す)。 */
function zoomAt(factor: number, cx: number, cy: number): void {
  const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, view.zoom * factor));
  const ratio = next / view.zoom;
  view.x = cx - (cx - view.x) * ratio;
  view.y = cy - (cy - view.y) * ratio;
  view.zoom = next;
  applyView();
}

function zoomAtCenter(factor: number): void {
  const box = canvas()?.getBoundingClientRect();
  zoomAt(factor, (box?.width ?? 0) / 2, (box?.height ?? 0) / 2);
}

/**
 * 全体を出す。**中身の高さに合わせる** — 図は箱の幅に合わせて描かれるので、
 * 100% でも縦がはみ出ることがある (細いパネル、縦長の板)。キャンバスは
 * スクロールしないので、ここで縮めないと下が永久に隠れる。
 */
function fit(): void {
  view.zoom = 1;
  view.x = 0;
  view.y = 0;
  applyView();

  const box = canvas()?.getBoundingClientRect();
  const content = query<HTMLElement>('.cf-body')?.getBoundingClientRect();
  if (box === undefined || content === undefined || content.height === 0) return;
  const scale = Math.min(1, box.height / content.height);
  if (scale >= 1) return;
  view.zoom = Math.max(ZOOM_MIN, scale);
  applyView();
}

/** キャンバスの中の座標 (ズームの中心に使う)。 */
function inCanvas(event: { clientX: number; clientY: number }): { x: number; y: number } {
  const box = canvas()?.getBoundingClientRect();
  return { x: event.clientX - (box?.left ?? 0), y: event.clientY - (box?.top ?? 0) };
}

let panning: { x: number; y: number; viewX: number; viewY: number } | null = null;
let spaceHeld = false;

// ---------------------------------------------------------------- カーソルの下

/**
 * その位置にあるものを**全部**読む。層の重なりに頼らない (`elementsFromPoint` は
 * 重なった要素を上から順に返す) ので、部品の升に立つ節点も、部品の下の配線も、
 * どれも同時に分かる。どれを対象にするかは状態遷移が決める。
 */
function underAt(x: number, y: number): Under {
  const stack = document.elementsFromPoint(x, y);
  // 図の根は `.cf-body` の中の SVG (class はフェンスごとに違うので、箱で見る)。
  if (!stack.some((element) => element.closest('.cf-body'))) return NOTHING;
  const find = (selector: string, name: string): string | null => {
    for (const element of stack) {
      const hit = element.closest<HTMLElement>(selector);
      const value = hit?.dataset[name];
      if (value !== undefined) return value;
    }
    return null;
  };
  return {
    cell: find('.cf-cell', 'address'),
    part: find('.cf-chip', 'part'),
    node: find('.cf-dot', 'node'),
    wire: find('.cf-wire-hit', 'line'),
    pin: find('.cf-pin-hit', 'pin'),
  };
}

const sameUnder = (a: Under, b: Under): boolean =>
  a.cell === b.cell && a.part === b.part && a.node === b.node && a.wire === b.wire && a.pin === b.pin;

// ---------------------------------------------------------------- 印

/** 選んだ枠と部品のあいだの余白 (図の座標)。穴 1 つより狭く取って、隣と紛れない。 */
const HELD_PAD = 4;

/** 選んだ印を付ける先。**配線は掴む線ではなく見える線**に付ける。 */
function shownFor(picked: Picked | null): Element | null {
  if (picked === null) return null;
  const id = CSS.escape(picked.id);
  if (picked.kind === 'part') return query(`.cf-chip[data-part="${id}"]`);
  if (picked.kind === 'node') return query(`.cf-dot[data-node="${id}"]`);
  return query(`.cf-wire[data-line="${id}"]`);
}

const unmark = (className: string): void => {
  for (const element of document.querySelectorAll(`.${className}`)) element.classList.remove(className);
};

/**
 * 選んだものを囲む枠。**中の線を塗り替えるだけでは足りない** —
 * circuit のマップは記号なので線に色を付ければ分かるが、breadboard と
 * perfboard の `.cf-chip` は**実物の姿そのもの**で、中に塗り替える線が無く、
 * あっても部品の色に紛れる (実機で「選択が分かりにくい」と指摘された)。
 * 姿に依らない外枠なら、どのフェンスでも同じように分かる。
 */
function frameSelected(shown: Element | null): void {
  document.querySelector('.cf-held-box')?.remove();
  if (!(shown instanceof SVGGraphicsElement) || !shown.classList.contains('cf-chip')) return;

  const box = shown.getBBox();
  if (box.width === 0 && box.height === 0) return;
  const frame = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  frame.setAttribute('class', 'cf-held-box');
  frame.setAttribute('x', String(box.x - HELD_PAD));
  frame.setAttribute('y', String(box.y - HELD_PAD));
  frame.setAttribute('width', String(box.width + HELD_PAD * 2));
  frame.setAttribute('height', String(box.height + HELD_PAD * 2));
  // **同じ姿勢で描く**: getBBox は要素自身の transform を含まないので、写して合わせる。
  const posture = shown.getAttribute('transform');
  if (posture !== null) frame.setAttribute('transform', posture);
  // 手前に置く。部品が重なっていても枠が隠れない (当たり判定は CSS で外す)。
  shown.after(frame);
}

function markSelected(picked: Picked | null, also: readonly Picked[] = []): void {
  unmark('cf-held');
  // **まとめて選んだものは全部光らせる。** 枠を出すのは押した 1 つだけ
  // (全部に枠を出すと、どれを軸に動かすのか読めない)。
  for (const one of also) shownFor(one)?.classList.add('cf-held');
  const shown = shownFor(picked);
  shown?.classList.add('cf-held');
  frameSelected(shown);
}

/**
 * カーソルの下で鍵の対象になるもの (持ち物が無いときだけ)。**選ぶ順は
 * 状態遷移と同じ `topOf`** — 別々に持つと、光っているものと押して選ばれる
 * ものが食い違う。
 */
function markHover(now: State): void {
  unmark('cf-hover');
  if (now.carry !== null || now.tool !== 'select') return;
  shownFor(topOf(now.under))?.classList.add('cf-hover');
}

/** ゴースト — 置く・動かす先の穴を光らせる。置けないときは赤。 */
function markGhost(now: State): void {
  unmark('cf-ghost');
  unmark('cf-ghost-bad');
  if (now.carry === null || now.ghost === null) return;
  const className = now.ghost.ok ? 'cf-ghost' : 'cf-ghost-bad';
  for (const cell of now.ghost.cells) {
    query(`.cf-cell[data-address="${CSS.escape(cell)}"]`)?.classList.add(className);
  }
}

/** 穴 1 つの真ん中 (図の座標)。当たり判定の四角から読む。 */
function cellCentre(address: string): { readonly x: number; readonly y: number } | null {
  const cell = query<SVGGraphicsElement>(`.cf-cell[data-address="${CSS.escape(address)}"]`);
  if (cell === null) return null;
  const box = cell.getBBox();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/**
 * ずらしの基準にする穴。**先頭の穴 (アンカー)** — 置くのも動かすのもアンカーが
 * 押した穴に来る決まりなので、そこを合わせれば絵と穴が必ず揃う。
 *
 * **真ん中で合わせない。** 足の並べ方は板が決めるので、同じ部品でも板の端では
 * 左へ伸びたり右へ伸びたりする。真ん中で合わせると、伸びる向きが変わった
 * ときに絵が穴からずれる。
 */
function anchorOf(cells: readonly string[]): { readonly x: number; readonly y: number } | null {
  const first = cells[0];
  return first === undefined ? null : cellCentre(first);
}

/**
 * 運んでいる部品の姿を行き先に出す。**穴を光らせるだけでは何が来るのか
 * 読み取れない** (実機で「移動するとき、選択した見た目で移動するようにする。
 * 現在のピン表示は分かりにくい」と言われた)。
 *
 * **描き直さない — いま図にある絵を写して平行移動する。** 動かすのは平行移動
 * なので姿は変わらず、拡張に問い合わせ直さずに済む (ゴーストは穴をまたぐたびに
 * 出るので、1 回でも図を組み直すと重くなる)。
 */
/** 置く部品の絵。拡張が寄こした markup を図の中へ入れて、掴めなくする。 */
let placedChip: { readonly markup: string; readonly node: SVGGraphicsElement } | null = null;

function chipFrom(markup: string): SVGGraphicsElement | null {
  if (placedChip?.markup === markup) return placedChip.node;
  const holder = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  holder.innerHTML = markup;
  const node = holder.firstElementChild;
  if (!(node instanceof SVGGraphicsElement)) return null;
  placedChip = { markup, node };
  return node;
}

function markCarried(now: State): void {
  document.querySelector('.cf-ghost-part')?.remove();
  unmark('cf-lifted');
  if (now.carry === null || now.ghost === null) return;

  // 動かすときは**図にある絵を写す**。置くときは拡張が寄こした絵を使う
  // (図にまだ無い部品なので、写す先が無い)。
  const held = now.carry.kind === 'move'
    ? query<SVGGraphicsElement>(`.cf-chip[data-part="${CSS.escape(now.carry.part)}"]`)
    : now.carry.kind === 'place' && now.ghost.chip !== undefined
      ? chipFrom(now.ghost.chip)
      : null;
  if (held === null) return;
  // 持ち上げたものは薄くする。**行き先の絵と二重に見えない**ように。
  if (now.carry.kind === 'move') held.classList.add('cf-lifted');

  const from = anchorOf(now.ghost.from ?? []);
  const to = anchorOf(now.ghost.cells);
  if (from === null || to === null) return;

  const ghost = held.cloneNode(true) as SVGGraphicsElement;
  // 掴む印は写さない (ゴーストは掴めない。名札が 2 つあると選ぶ先が狂う)。
  ghost.removeAttribute('data-part');
  for (const marked of ghost.querySelectorAll('[data-part]')) marked.removeAttribute('data-part');
  ghost.setAttribute('class', `cf-ghost-part${now.ghost.ok ? '' : ' cf-ghost-part-bad'}`);
  // **元の姿勢の前にずらしを足す** (部品が自分の transform を持っていても壊さない)。
  const posture = held.getAttribute('transform');
  const shift = `translate(${to.x - from.x} ${to.y - from.y})`;
  ghost.setAttribute('transform', posture === null ? shift : `${shift} ${posture}`);
  // **図の中へ入れる。** 置くときの絵は図の外で組んであるので、入れ先は
  // 図にある部品の親 (無ければ図そのもの) にする。
  const into = query('.cf-chip')?.parentNode ?? query('svg');
  (into as Element | null)?.appendChild(ghost);
}

/** いま置こうとしている部品。パレットのどれを押したかを見せる。 */
function markChosen(now: State): void {
  unmark('cf-chosen');
  if (now.carry?.kind !== 'place') return;
  for (const element of document.querySelectorAll(`.cf-pick[data-type="${CSS.escape(now.carry.type)}"]`)) {
    element.classList.add('cf-chosen');
  }
}

/**
 * 配線の 1 点目。2 点目を押すまで印を出しておく。
 * **穴でも足でもよい** — 綴りはフェンスのものなので、両方の名札を当たってみる。
 */
function markWireFrom(now: State): void {
  unmark('cf-from');
  if (now.wireFrom === null) return;
  const escaped = CSS.escape(now.wireFrom);
  const at = query(`.cf-cell[data-address="${escaped}"]`) ?? query(`.cf-pin-hit[data-pin="${escaped}"]`);
  at?.classList.add('cf-from');
}

function paint(now: State): void {
  markSelected(now.selected, now.also);
  markHover(now);
  markGhost(now);
  markCarried(now);
  markChosen(now);
  markWireFrom(now);
  // 道具は CSS が見る目印にする (右の道具の列の光り方、カーソルの形)。
  // **「置く」は道具ではなく持ち物** (`carry`)。CSS から見た顔だけをここで作る。
  document.body.dataset.tool = now.carry?.kind === 'place' ? 'place' : now.tool;
  document.body.classList.toggle('cf-carrying', now.carry !== null);
  setText('.kc-cell', now.under.cell ?? '');
}

// ---------------------------------------------------------------- 選択窓・欄

const chooser = (): HTMLElement | null => query<HTMLElement>('.kc-chooser');
const searchBox = (): HTMLInputElement | null => query<HTMLInputElement>('.cf-search');
const fieldInput = (name: string): HTMLInputElement | null => query<HTMLInputElement>(`.cf-field[name="${name}"]`);

function openChooser(): void {
  const box = chooser();
  if (box === null) return;
  box.hidden = false;
  const search = searchBox();
  search?.focus();
  search?.select();
}

function closeChooser(): void {
  const box = chooser();
  if (box === null) return;
  box.hidden = true;
  searchBox()?.blur();
}

/** 検索で残っている先頭の候補。`Enter` で置く。 */
const firstPick = (): HTMLElement | null =>
  query<HTMLElement>('.cf-types li:not(.cf-hidden) .cf-pick') ?? query<HTMLElement>('.cf-icons .cf-pick');

function pick(button: HTMLElement): void {
  const type = button.dataset.type;
  if (type === undefined) return;
  closeChooser();
  run({ kind: 'place', type, twoEnds: button.dataset.ends === '2' });
}

/**
 * 欄へフォーカスを移したいが、**まだ欄が出ていないことがある** — 属性は拡張が
 * 送り返してくるまで隠れているので、その場で `focus()` を呼んでも何も起きない。
 * 出るまで覚えておいて、届いたときに移す。
 */
let wantsField = false;

function focusIntoId(): void {
  const field = fieldInput('id');
  field?.focus();
  field?.select();
}

function focusOn(focus: Focus | null): void {
  if (focus === 'search') openChooser();
  if (focus !== 'id') return;
  if (query<HTMLFormElement>('.cf-inspector')?.hidden !== false) {
    wantsField = true;
    return;
  }
  focusIntoId();
}

// ---------------------------------------------------------------- 右クリック

const menu = (): HTMLElement | null => query<HTMLElement>('.kc-menu');

/**
 * 右クリックの一覧を、押した所に出す。**中身は道具の列と同じ** — 鍵を知らなくても
 * 全部できるようにするためのもので、新しい操作は増やさない。
 *
 * 押した所のものに効かせたいので、**開く前にカーソルの下を取り直す** (右クリックは
 * ホバーを伴わずに来ることがある)。
 */
function openMenu(x: number, y: number): void {
  const box = menu();
  const frame = canvas()?.getBoundingClientRect();
  if (box === null || frame === undefined) return;
  run({ kind: 'hover', under: underAt(x, y) });

  box.hidden = false;
  // 枠からはみ出さない所へ (右下に出すのが既定)。
  const size = box.getBoundingClientRect();
  const left = Math.min(x - frame.left, Math.max(0, frame.width - size.width));
  const top = Math.min(y - frame.top, Math.max(0, frame.height - size.height));
  box.style.left = `${left}px`;
  box.style.top = `${top}px`;
}

const closeMenu = (): void => {
  const box = menu();
  if (box !== null) box.hidden = true;
};

document.addEventListener('contextmenu', (event) => {
  if (elementOf(event)?.closest('.kc-canvas') == null) return;
  // webview には既定のメニューが無いので、出すのはこちらの仕事。
  event.preventDefault();
  openMenu(event.clientX, event.clientY);
});

// ---------------------------------------------------------------- 流す

/**
 * 起きたことを流し、返ってきた状態を画面に映す。**その打鍵を握ったか**を返す
 * (握ったものだけ既定の動きを止める)。
 */
function run(event: Event): boolean {
  const outcome = step(state, event);
  state = outcome.state;
  for (const message of outcome.send) vscode.postMessage(message);
  setText('.cf-status', outcome.status);
  paint(state);
  focusOn(outcome.focus);
  return outcome.handled;
}

/** カーソルの位置からカーソルの下を取り直す (組み直しのあとや、鍵で持ち上げたあと)。 */
function syncHover(): void {
  if (pointer === null) return;
  const under = underAt(pointer.x, pointer.y);
  if (!sameUnder(under, state.under)) run({ kind: 'hover', under });
}

/**
 * その出来事が起きた要素。**`document` に届いた出来事もある**ので、要素かどうかを
 * 見てから返す (素で `closest` を呼ぶと落ちる)。
 */
const elementOf = (event: { readonly target: EventTarget | null }): Element | null =>
  (event.target instanceof Element ? event.target : null);

/** 欄に字を打っている最中か。**打鍵を横取りしない**。 */
const typing = (target: EventTarget | null): boolean =>
  ['INPUT', 'SELECT', 'TEXTAREA'].includes((target as Element | null)?.tagName ?? '');

// ---------------------------------------------------------------- ポインタ

/**
 * 領域で囲んで選ぶ (ラバーバンド)。**何も無い所を押して引いたときだけ** —
 * 部品や穴の上から始めると、掴んで動かすのと見分けが付かない。
 *
 * 中身を数えるのはここ (DOM) の仕事。どの部品がどこに描かれているかを
 * 知っているのはこちらで、状態機械は覚えるだけ。
 */
let band: { readonly x: number; readonly y: number } | null = null;

const bandBox = (): HTMLElement | null => query<HTMLElement>('.kc-band-select');

function showBand(from: { readonly x: number; readonly y: number }, x: number, y: number): void {
  let box = bandBox();
  if (box === null) {
    box = document.createElement('div');
    box.className = 'kc-band-select';
    canvas()?.appendChild(box);
  }
  const canvasBox = canvas()?.getBoundingClientRect();
  const left = Math.min(from.x, x) - (canvasBox?.left ?? 0);
  const top = Math.min(from.y, y) - (canvasBox?.top ?? 0);
  box.style.left = `${left}px`;
  box.style.top = `${top}px`;
  box.style.width = `${Math.abs(x - from.x)}px`;
  box.style.height = `${Math.abs(y - from.y)}px`;
}

const hideBand = (): void => { bandBox()?.remove(); };

/** 囲んだ中にある部品の名札。**中心が入っていれば選ぶ** (端がかすっただけでは選ばない)。 */
function partsInside(from: { readonly x: number; readonly y: number }, x: number, y: number): readonly string[] {
  const left = Math.min(from.x, x);
  const right = Math.max(from.x, x);
  const top = Math.min(from.y, y);
  const bottom = Math.max(from.y, y);
  const found: string[] = [];
  for (const chip of document.querySelectorAll('.cf-chip[data-part]')) {
    const box = chip.getBoundingClientRect();
    const cx = box.left + box.width / 2;
    const cy = box.top + box.height / 2;
    const id = chip.getAttribute('data-part');
    if (id !== null && cx >= left && cx <= right && cy >= top && cy <= bottom) found.push(id);
  }
  return found;
}

document.addEventListener('pointerdown', (event) => {
  const target = elementOf(event);
  // 一覧の外を押したら閉じる (中は `click` が拾う)。
  if (target?.closest('.kc-menu') == null) closeMenu();
  const onCanvas = target?.closest('.kc-canvas') != null && target?.closest('.kc-chooser') == null;
  // 中ボタン (か Space + 左) でパン。KiCad と同じ。
  if (onCanvas && (event.button === 1 || (event.button === 0 && spaceHeld))) {
    panning = { x: event.clientX, y: event.clientY, viewX: view.x, viewY: view.y };
    event.preventDefault();
    return;
  }
  if (event.button !== 0) return;
  if (target?.closest('.kc-chooser, .kc-props, .kc-top, .kc-tools, .kc-band, .kc-status')) return;
  const under = underAt(event.clientX, event.clientY);
  // **何も無い所から引いたら領域選択。** 掴むものがある所から始めたら今までどおり。
  if (onCanvas && state.tool === 'select' && state.carry === null
    && under.part === null && under.node === null && under.wire === null) {
    band = { x: event.clientX, y: event.clientY };
  }
  run({ kind: 'press', under, x: event.clientX, y: event.clientY, onMap: onCanvas });
});

document.addEventListener('pointermove', (event) => {
  pointer = { x: event.clientX, y: event.clientY };
  // **道具の列の上ではカーソルの下を捨てない。** 捨てると「部品にカーソルを置いて
  // 回すボタンを押す」が効かなくなる (押した時点で対象が消えている)。
  if (elementOf(event)?.closest('.kc-tools') != null) return;
  if (panning !== null) {
    view.x = panning.viewX + (event.clientX - panning.x);
    view.y = panning.viewY + (event.clientY - panning.y);
    applyView();
    return;
  }
  const under = underAt(event.clientX, event.clientY);
  if (band !== null && (event.buttons & 1) !== 0) {
    showBand(band, event.clientX, event.clientY);
    return;
  }
  if ((event.buttons & 1) !== 0 && state.pressed !== null) {
    run({ kind: 'drag', under, x: event.clientX, y: event.clientY });
    return;
  }
  if (!sameUnder(under, state.under)) run({ kind: 'hover', under });
});

document.addEventListener('pointerup', (event) => {
  if (panning !== null) {
    panning = null;
    return;
  }
  if (event.button !== 0) return;
  if (band !== null) {
    const from = band;
    band = null;
    hideBand();
    // **少しの動きは領域ではなく「押した」。** 手が震えただけで選び直さない。
    if (Math.abs(event.clientX - from.x) + Math.abs(event.clientY - from.y) > DRAG) {
      run({ kind: 'pickMany', parts: partsInside(from, event.clientX, event.clientY) });
      return;
    }
  }
  const target = elementOf(event);
  if (target?.closest('.kc-chooser, .kc-props, .kc-top, .kc-tools, .kc-band, .kc-status') && state.pressed === null) return;
  run({
    kind: 'release',
    under: underAt(event.clientX, event.clientY),
    x: event.clientX,
    y: event.clientY,
    shift: event.shiftKey,
  });
});

// 窓の外で放したときなど、放した知らせが来ないことがある。
document.addEventListener('pointercancel', () => { panning = null; run({ kind: 'cancel' }); });

document.addEventListener('dblclick', (event) => {
  const target = elementOf(event);
  if (target?.closest('.kc-canvas') == null) return;
  run({ kind: 'dblclick', under: underAt(event.clientX, event.clientY) });
});

document.addEventListener('wheel', (event) => {
  const target = elementOf(event);
  if (target?.closest('.kc-canvas') == null || target?.closest('.kc-chooser') != null) return;
  event.preventDefault();
  const at = inCanvas(event);
  zoomAt(event.deltaY < 0 ? WHEEL_STEP : 1 / WHEEL_STEP, at.x, at.y);
}, { passive: false });

// ---------------------------------------------------------------- 鍵

document.addEventListener('keydown', (event) => {
  const target = elementOf(event);

  // 選択窓の検索欄。Enter で先頭の候補、Esc で閉じる。ほかは欄に任せる。
  if (target?.classList.contains('cf-search')) {
    if (event.key === 'Enter') {
      event.preventDefault();
      const first = firstPick();
      if (first) pick(first);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      closeChooser();
      return;
    }
    return;
  }
  if (typing(target)) {
    // 欄の Esc は欄を離れる (そのあとの Esc は状態遷移の Esc になる)。
    if (event.key === 'Escape') (target as HTMLElement).blur();
    return;
  }

  if (event.key === 'Escape' && menu()?.hidden === false) {
    event.preventDefault();
    closeMenu();
    return;
  }
  if (event.key === ' ') {
    spaceHeld = true;
    event.preventDefault();
    return;
  }
  if (event.key === 'Home') {
    event.preventDefault();
    fit();
    return;
  }
  if (event.key === '+' || event.key === '=') {
    zoomAtCenter(KEY_STEP);
    return;
  }
  if (event.key === '-') {
    zoomAtCenter(1 / KEY_STEP);
    return;
  }

  const handled = run({
    kind: 'key',
    key: event.key,
    shift: event.shiftKey,
    modifier: event.ctrlKey || event.metaKey || event.altKey,
  });
  if (handled) event.preventDefault();
  // 鍵で持ち上げたら、いまのカーソルの下にゴーストを出す。
  if (handled) syncHover();
});

document.addEventListener('keyup', (event) => {
  if (event.key === ' ') spaceHeld = false;
});

// **窓の外へ出たら Space を離したことにする。** 押したまま別のタブへ移ると
// `keyup` が届かず、戻ってきたあとの左クリックが全部「移動」になる。
window.addEventListener('blur', () => { spaceHeld = false; panning = null; });
document.addEventListener('visibilitychange', () => { spaceHeld = false; panning = null; });

// ---------------------------------------------------------------- クリック (ボタン)

document.addEventListener('click', (event) => {
  const target = elementOf(event);

  // パレット。選ぶと持ち物になり、`Esc` まで続く。
  const chosen = target?.closest<HTMLElement>('.cf-pick');
  if (chosen?.dataset.type !== undefined) {
    pick(chosen);
    return;
  }

  // 右の道具の列と右クリックの一覧。鍵と同じことをする (鍵を知らなくても押せる)。
  const tool = target?.closest<HTMLElement>('.kc-tool');
  if (tool?.dataset.key !== undefined) {
    closeMenu();
    run({ kind: 'key', key: tool.dataset.key, shift: event.shiftKey, modifier: tool.dataset.modifier === '1' });
    return;
  }
  closeMenu();

  // 帯の 1 行。**書き換えはしない** — 直すのは書き手の仕事で、こちらは場所を指すだけ。
  const row = target?.closest<HTMLElement>('.cf-issue[data-line]');
  if (row?.dataset.line !== undefined) {
    vscode.postMessage({ kind: 'goto', line: Number(row.dataset.line) });
    return;
  }

  if (target?.closest('.kc-zoom-in')) { zoomAtCenter(KEY_STEP); return; }
  if (target?.closest('.kc-zoom-out')) { zoomAtCenter(1 / KEY_STEP); return; }
  if (target?.closest('.kc-fit')) { fit(); return; }
  if (target?.closest('.kc-chooser-close')) { closeChooser(); return; }

  // 戻す・やり直すは拡張側に頼む (webview には文書が無い)。
  const button = target?.closest<HTMLButtonElement>('.cf-undo, .cf-redo');
  if (!button || button.disabled) return;
  vscode.postMessage({ kind: button.classList.contains('cf-undo') ? 'undo' : 'redo' });
});

document.addEventListener('change', (event) => {
  const target = event.target as HTMLSelectElement | HTMLInputElement | null;
  if (target === null) return;

  // 欄。名前だけは 3 か所に散るので別の道 (`rename`)。
  // **配線にも欄がある** (色)。何を選んでいるかを添えて、名札は拡張が組む —
  // 名前の無いものをどう指すかは文法の話で、殻の持ち物ではない。
  if (target.classList.contains('cf-field')) {
    const picked = state.selected;
    if (picked === null || picked.kind === 'node') return;
    const written = target.value.trim();
    vscode.postMessage(target.name === 'id'
      ? { kind: 'rename', part: picked.id, text: written }
      : { kind: 'setField', what: picked.kind, part: picked.id, field: target.name, text: written });
    return;
  }

  // フェンスの一覧。選んだ行を拡張へ (どのフェンスを出すかは拡張が覚える)。
  if (target.classList.contains('cf-fence')) {
    vscode.postMessage({ kind: 'fence', line: Number(target.value) });
  }
});

/**
 * エディタのカーソルが指しているものを光らせる (掴んだものをエディタで
 * 光らせるのと逆向き)。**掴む印とは別の class** — 持っているものと
 * 触れているものを取り違えない。
 */
function aim(what: string | undefined, id: string | undefined): void {
  unmark('cf-aim');
  if (what === undefined || id === undefined) return;

  const escaped = CSS.escape(id);
  const selector = what === 'part'
    ? `.cf-chip[data-part="${escaped}"]`
    : what === 'node' ? `.cf-dot[data-node="${escaped}"]` : `.cf-wire[data-line="${escaped}"]`;
  for (const element of document.querySelectorAll(selector)) element.classList.add('cf-aim');
}

/** 欄に出す中身 (`core/edit/field.ts` の `PartFields`)。 */
type Fields = {
  readonly id: string;
  readonly type: string;
  readonly value: string;
  readonly label: string;
  /** 色。**いまは配線だけ**が持つ。 */
  readonly color: string;
  /** 書ける欄。**フェンスが決める** (種類の語彙は殻の持ち物ではない)。 */
  readonly can: readonly ('type' | 'value' | 'label' | 'color')[];
};

/**
 * 選んだ部品の欄を出す。**打っている最中の欄は書き換えない** —
 * 書き換えのたびに送り直されるので、上書きすると打てなくなる。
 */
function showFields(part: Fields | null): void {
  const form = query<HTMLFormElement>('.cf-inspector');
  const idle = query<HTMLElement>('.kc-props-hint');
  if (form === null) return;
  form.hidden = part === null;
  if (idle) idle.hidden = part !== null;
  if (part === null) {
    wantsField = false;
    return;
  }
  // 欄が出るのを待っていた `E` / ダブルクリックを、ここで果たす。
  if (wantsField) {
    wantsField = false;
    focusIntoId();
  }

  const fill = (name: string, value: string, enabled: boolean): void => {
    const input = fieldInput(name);
    if (input === null) return;
    input.disabled = !enabled;
    if (document.activeElement !== input) input.value = value;
  };
  // **名前を直せるのは名前のあるものだけ。** 配線と注釈は行で指すので直せない。
  fill('id', part.id, part.can.includes('type'));
  fill('type', part.type, part.can.includes('type'));
  // **書ける欄はフェンスが決める。** 殻は種類の語を知らない。
  fill('value', part.value, part.can.includes('value'));
  fill('label', part.label, part.can.includes('label'));
  fill('color', part.color, part.can.includes('color'));
}

type Incoming =
  | { readonly kind: 'map'; readonly html: string; readonly picker: string; readonly issues: string }
  | { readonly kind: 'status'; readonly text: string }
  | { readonly kind: 'aim'; readonly what?: string; readonly id?: string }
  | { readonly kind: 'history'; readonly canUndo: boolean; readonly canRedo: boolean }
  | { readonly kind: 'fields'; readonly part: Fields | null }
  | {
    readonly kind: 'ghost'; readonly key: string; readonly cells: readonly string[];
    readonly ok: boolean; readonly why: string; readonly from?: readonly string[];
    readonly chip?: string;
  };

const fill = (selector: string, html: string): void => {
  const target = query(selector);
  if (target) target.innerHTML = html;
};

window.addEventListener('message', (event: MessageEvent<Incoming>) => {
  const message = event.data;
  if (message.kind === 'map') {
    fill('.cf-body', message.html);
    fill('.cf-fences', message.picker);
    fill('.cf-band', message.issues);
    applyView();
    // **選んでいたものが残っていれば選んだまま。** 書き換えのたびに組み直る
    // ので、そのたびに離すと欄で値を直せない。消えていれば捨てる。
    if (state.selected !== null && shownFor(state.selected) !== null) {
      // 光と欄も送り直してもらう (拡張側は何を選んでいるかを覚えていない)。
      vscode.postMessage({ kind: 'select', what: state.selected.kind, id: state.selected.id });
    } else {
      run({ kind: 'refresh' });
    }
    // 組み直した図の上で、カーソルの下を取り直す (持ち物のゴーストも訊き直す)。
    // **いったん空に戻す** — 同じ番地でも要素は入れ替わっているので、印を付け直す。
    run({ kind: 'hover', under: NOTHING });
    syncHover();
  }
  if (message.kind === 'ghost') {
    run({
      kind: 'ghost',
      ghost: {
        key: message.key, cells: message.cells, ok: message.ok, why: message.why,
        from: message.from, chip: message.chip,
      },
    });
  }
  if (message.kind === 'fields') showFields(message.part);
  if (message.kind === 'status') setText('.cf-status', message.text);
  if (message.kind === 'aim') aim(message.what, message.id);
  if (message.kind === 'history') {
    const undo = query<HTMLButtonElement>('.cf-undo');
    const redo = query<HTMLButtonElement>('.cf-redo');
    if (undo) undo.disabled = !message.canUndo;
    if (redo) redo.disabled = !message.canRedo;
  }
});

/**
 * パレットの検索。**種類名・略記・和名**のどれでも引ける (覚えている呼び方が
 * 人による)。DOM を隠すだけなので、状態遷移には関わらない。
 */
document.addEventListener('input', (event) => {
  const box = event.target as HTMLInputElement | null;
  if (box === null || !box.classList.contains('cf-search')) return;

  const wanted = box.value.trim().toLowerCase();
  for (const row of document.querySelectorAll<HTMLElement>('.cf-types li')) {
    const find = row.querySelector<HTMLElement>('.cf-pick')?.dataset.find ?? '';
    row.classList.toggle('cf-hidden', wanted !== '' && !find.includes(wanted));
  }
});

// 欄で Enter を押したときに送り直さない (`change` が既に当てている)。
document.addEventListener('submit', (event) => { event.preventDefault(); });

// パレットの `details` は選択窓の中では常に開いておく (窓そのものが開け閉めの単位)。
for (const details of document.querySelectorAll<HTMLDetailsElement>('.kc-chooser details')) details.open = true;

setText('.cf-status', step(state, { kind: 'hover', under: NOTHING }).status);
applyView();
