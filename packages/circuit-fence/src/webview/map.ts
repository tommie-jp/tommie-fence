import { start, step } from './mapState.ts';
import type { Event, Picked, State } from './mapState.ts';

/**
 * マップの webview の**DOM を触る側**。何が起きたかを読んで状態遷移
 * (`mapState.ts`) に渡し、返ってきたものを画面と拡張へ流すだけ。
 *
 * **ここは薄く保つ。** 決め事はすべて `mapState.ts` にあり、そちらは DOM も
 * vscode も知らない純関数として node のテストに掛かっている。道具・パレット・
 * インスペクタが増えても、増えるのはあちらで、こちらではない。
 *
 * webview は拡張が渡した HTML をサニタイズしないので、フェンスから来た字は
 * すべて拡張側でエスケープ済みのものだけを受け取る。
 */

declare function acquireVsCodeApi(): { postMessage: (message: unknown) => void };

const vscode = acquireVsCodeApi();

let state: State = start(document.body.classList.contains('cf-own-undo'));

const statusBar = (): Element | null => document.querySelector('.cf-status');

const setStatus = (text: string): void => {
  const bar = statusBar();
  if (bar) bar.textContent = text;
};

/** 選んだ印を付ける先。**配線は掴む線ではなく見える線**に付ける。 */
function shownFor(picked: Picked | null): Element | null {
  if (picked === null) return null;
  const id = CSS.escape(picked.id);
  if (picked.kind === 'part') return document.querySelector(`.cf-chip[data-part="${id}"]`);
  if (picked.kind === 'node') return document.querySelector(`.cf-dot[data-node="${id}"]`);
  return document.querySelector(`.cf-wire[data-line="${id}"]`);
}

function mark(picked: Picked | null): void {
  for (const element of document.querySelectorAll('.cf-held')) element.classList.remove('cf-held');
  shownFor(picked)?.classList.add('cf-held');
}

/**
 * 起きたことを流し、返ってきた状態を画面に映す。**その打鍵を握ったか**を返す
 * (握ったものだけ既定の動きを止める)。
 */
function run(event: Event): boolean {
  const outcome = step(state, event);
  state = outcome.state;

  for (const message of outcome.send) vscode.postMessage(message);
  if (outcome.status !== null) setStatus(outcome.status);
  mark(state.picked);
  document.body.classList.toggle('cf-nodes', state.mode === 'node');
  // 置き先の当たり判定は**ドラッグの間だけ**効かせる。いつも効かせると部品を
  // 掴めず、いつも切ると埋まった升へ置けない (同じ番地に置くのは正当な操作)。
  document.body.classList.toggle('cf-holding', state.pressed !== null && state.picked?.kind !== 'wire');
  return outcome.handled;
}

/** 押した先にある掴める物。**どれを掴めるかを決めるのは状態遷移のほう。** */
function pickedAt(target: Element | null): Picked | null {
  if (target === null) return null;

  const dot = target.closest<SVGElement>('.cf-dot');
  if (dot?.dataset.node !== undefined) return { kind: 'node', id: dot.dataset.node };
  const chip = target.closest<SVGElement>('.cf-chip');
  if (chip?.dataset.part !== undefined) return { kind: 'part', id: chip.dataset.part };
  const wire = target.closest<SVGElement>('.cf-wire-hit');
  return wire?.dataset.line === undefined ? null : { kind: 'wire', id: wire.dataset.line };
}

/** 放した所の升。**当たり判定を切る前に引く** (切ると座標から引けなくなる)。 */
function cellUnder(event: PointerEvent): string | null {
  const target = event.target as Element | null;
  const direct = target?.closest<SVGElement>('.cf-cell');
  if (direct) return direct.dataset.address ?? null;
  // 触ったままのドラッグは押した要素へ暗黙に捕まるので、座標から引き直す。
  const under = document.elementFromPoint(event.clientX, event.clientY);
  return under?.closest<SVGElement>('.cf-cell')?.dataset.address ?? null;
}

/** 欄に字を打っている最中か。**打鍵を横取りしない** (一覧は頭文字で選べる)。 */
const typing = (target: EventTarget | null): boolean =>
  ['INPUT', 'SELECT', 'TEXTAREA'].includes((target as Element | null)?.tagName ?? '');

document.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  const target = event.target as Element | null;
  run({
    kind: 'press',
    on: pickedAt(target),
    x: event.clientX,
    y: event.clientY,
    onMap: target?.closest('.cf-map') !== null && target?.closest('.cf-map') !== undefined,
  });
});

document.addEventListener('pointerup', (event) => {
  run({ kind: 'release', x: event.clientX, y: event.clientY, cell: cellUnder(event) });
});

// 窓の外で放したときなど、放した知らせが来ないことがある。
document.addEventListener('pointercancel', () => { run({ kind: 'cancel' }); });

document.addEventListener('keydown', (event) => {
  const handled = run({
    kind: 'key',
    key: event.key,
    shift: event.shiftKey,
    modifier: event.ctrlKey || event.metaKey || event.altKey,
    typing: typing(event.target),
  });
  if (handled) event.preventDefault();
});

document.addEventListener('click', (event) => {
  const target = event.target as Element | null;

  // 帯の 1 行。**書き換えはしない** — 直すのは書き手の仕事で、こちらは場所を指すだけ。
  const row = target?.closest<HTMLElement>('.cf-issue[data-line]');
  if (row?.dataset.line !== undefined) {
    vscode.postMessage({ kind: 'goto', line: Number(row.dataset.line) });
    return;
  }

  // 戻す・やり直すは拡張側に頼む (webview には文書が無い)。
  const button = target?.closest<HTMLButtonElement>('.cf-undo, .cf-redo');
  if (!button || button.disabled) return;
  vscode.postMessage({ kind: button.classList.contains('cf-undo') ? 'undo' : 'redo' });
});

document.addEventListener('change', (event) => {
  const target = event.target as HTMLSelectElement | HTMLInputElement | null;
  if (target === null) return;

  // フェンスの一覧。選んだ行を拡張へ (どのフェンスを出すかは拡張が覚える)。
  if (target.classList.contains('cf-fence')) {
    vscode.postMessage({ kind: 'fence', line: Number(target.value) });
    return;
  }
  if (target.name === 'cf-mode') run({ kind: 'mode', mode: target.value === 'node' ? 'node' : 'part' });
});

/**
 * エディタのカーソルが指しているものを光らせる (掴んだものをエディタで
 * 光らせるのと逆向き)。**掴む印とは別の class** — 持っているものと
 * 触れているものを取り違えない。
 */
function aim(what: string | undefined, id: string | undefined): void {
  for (const element of document.querySelectorAll('.cf-aim')) element.classList.remove('cf-aim');
  if (what === undefined || id === undefined) return;

  const escaped = CSS.escape(id);
  const selector = what === 'part'
    ? `.cf-chip[data-part="${escaped}"]`
    : what === 'node' ? `.cf-dot[data-node="${escaped}"]` : `.cf-wire[data-line="${escaped}"]`;
  for (const element of document.querySelectorAll(selector)) element.classList.add('cf-aim');
}

type Incoming =
  | { readonly kind: 'map'; readonly html: string; readonly picker: string; readonly issues: string }
  | { readonly kind: 'status'; readonly text: string }
  | { readonly kind: 'aim'; readonly what?: string; readonly id?: string }
  | { readonly kind: 'history'; readonly canUndo: boolean; readonly canRedo: boolean };

const fill = (selector: string, html: string): void => {
  const target = document.querySelector(selector);
  if (target) target.innerHTML = html;
};

window.addEventListener('message', (event: MessageEvent<Incoming>) => {
  const message = event.data;
  if (message.kind === 'map') {
    fill('.cf-body', message.html);
    fill('.cf-fences', message.picker);
    fill('.cf-band', message.issues);
    // 要素が入れ替わるので掴みを捨てる (印の付いた要素はもう無い)。
    run({ kind: 'refresh' });
  }
  if (message.kind === 'status') setStatus(message.text);
  if (message.kind === 'aim') aim(message.what, message.id);
  if (message.kind === 'history') {
    const undo = document.querySelector<HTMLButtonElement>('.cf-undo');
    const redo = document.querySelector<HTMLButtonElement>('.cf-redo');
    if (undo) undo.disabled = !message.canUndo;
    if (redo) redo.disabled = !message.canRedo;
  }
});
