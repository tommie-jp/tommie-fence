import { start, step } from './mapState.ts';
import type { Event, Picked, Placing, State } from './mapState.ts';

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
  markFrom(state.drawing);
  markChosen(state.placing);
  // 道具は CSS が見る目印にする (何が掴めるかは道具で変わる)。
  document.body.dataset.tool = state.tool;
  const tool = document.querySelector<HTMLInputElement>(`input[name="cf-tool"][value="${state.tool}"]`);
  if (tool) tool.checked = true;
  // 置き先の当たり判定は**ドラッグの間だけ**効かせる。いつも効かせると部品を
  // 掴めず、いつも切ると埋まった升へ置けない (同じ番地に置くのは正当な操作)。
  document.body.classList.toggle('cf-holding', state.pressed !== null && state.picked?.kind !== 'wire');
  return outcome.handled;
}

/** いま置こうとしている部品。パレットのどれを押したかを見せる。 */
function markChosen(placing: Placing | null): void {
  for (const element of document.querySelectorAll('.cf-chosen')) element.classList.remove('cf-chosen');
  if (placing === null) return;
  for (const element of document.querySelectorAll(`.cf-pick[data-type="${CSS.escape(placing.type)}"]`)) {
    element.classList.add('cf-chosen');
  }
}

/** 引きかけの配線の、押した交点。放すまで印を出しておく。 */
function markFrom(cell: string | null): void {
  for (const element of document.querySelectorAll('.cf-from')) element.classList.remove('cf-from');
  if (cell === null) return;
  document.querySelector(`.cf-cell[data-address="${CSS.escape(cell)}"]`)?.classList.add('cf-from');
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
    // 配線の道具は交点から引くので、押した所の升も渡す。
    cell: cellUnder(event),
    x: event.clientX,
    y: event.clientY,
    onMap: target?.closest('.cf-map') != null,
  });
});

document.addEventListener('pointerup', (event) => {
  run({ kind: 'release', x: event.clientX, y: event.clientY, cell: cellUnder(event), shift: event.shiftKey });
});

// 窓の外で放したときなど、放した知らせが来ないことがある。
document.addEventListener('pointercancel', () => { run({ kind: 'cancel' }); });

document.addEventListener('keydown', (event) => {
  // 欄へ飛ぶ鍵。**DOM だけの話**なので状態遷移には渡さない。
  if (event.key === 'F2' && state.picked?.kind === 'part') {
    event.preventDefault();
    fieldInput('id')?.focus();
    return;
  }
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

  // パレット。選ぶと「置く」道具になり、`Esc` まで続く。
  const pick = target?.closest<HTMLElement>('.cf-pick');
  if (pick?.dataset.type !== undefined) {
    run({ kind: 'place', placing: { type: pick.dataset.type, twoEnds: pick.dataset.ends === '2' } });
    return;
  }

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

  // 欄。名前だけは 3 か所に散るので別の道 (`rename`)。
  if (target.classList.contains('cf-field')) {
    const part = state.picked?.kind === 'part' ? state.picked.id : null;
    if (part === null) return;
    const written = target.value.trim();
    vscode.postMessage(target.name === 'id'
      ? { kind: 'rename', part, text: written }
      : { kind: 'setField', part, field: target.name, text: written });
    return;
  }

  // フェンスの一覧。選んだ行を拡張へ (どのフェンスを出すかは拡張が覚える)。
  if (target.classList.contains('cf-fence')) {
    vscode.postMessage({ kind: 'fence', line: Number(target.value) });
    return;
  }
  if (target.name !== 'cf-tool') return;
  const tool = target.value;
  if (tool === 'select' || tool === 'wire' || tool === 'node') run({ kind: 'tool', tool });
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

/** 欄に出す中身 (`core/edit/field.ts` の `PartFields`)。 */
type Fields = {
  readonly id: string;
  readonly type: string;
  readonly kind: 'two-terminal' | 'one-terminal' | 'multi-terminal';
  readonly value: string;
  readonly label: string;
};

const fieldInput = (name: string): HTMLInputElement | null =>
  document.querySelector<HTMLInputElement>(`.cf-field[name="${name}"]`);

/**
 * 選んだ部品の欄を出す。**打っている最中の欄は書き換えない** —
 * 書き換えのたびに送り直されるので、上書きすると打てなくなる。
 */
function showFields(part: Fields | null): void {
  const form = document.querySelector<HTMLFormElement>('.cf-inspector');
  if (form === null) return;
  form.hidden = part === null;
  if (part === null) return;

  const fill = (name: string, value: string, enabled: boolean): void => {
    const input = fieldInput(name);
    if (input === null) return;
    input.disabled = !enabled;
    if (document.activeElement !== input) input.value = value;
  };
  fill('id', part.id, true);
  fill('type', part.type, true);
  // 1 端子は「種類 番地」だけ、多端子に l= は無い (文法にその場所が無い)。
  fill('value', part.value, part.kind !== 'one-terminal');
  fill('label', part.label, part.kind === 'two-terminal');
}

type Incoming =
  | { readonly kind: 'map'; readonly html: string; readonly picker: string; readonly issues: string }
  | { readonly kind: 'status'; readonly text: string }
  | { readonly kind: 'aim'; readonly what?: string; readonly id?: string }
  | { readonly kind: 'history'; readonly canUndo: boolean; readonly canRedo: boolean }
  | { readonly kind: 'fields'; readonly part: Fields | null };

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
    // **掴んでいたものが残っていれば掴んだまま。** 書き換えのたびに組み直る
    // ので、そのたびに離すと欄で値を直せない。消えていれば捨てる。
    if (state.picked !== null && shownFor(state.picked) !== null) {
      mark(state.picked);
      // 光と欄も送り直してもらう (拡張側は何を掴んでいるかを覚えていない)。
      vscode.postMessage({ kind: 'select', what: state.picked.kind, id: state.picked.id });
    } else {
      run({ kind: 'refresh' });
    }
  }
  if (message.kind === 'fields') showFields(message.part);
  if (message.kind === 'status') setStatus(message.text);
  if (message.kind === 'aim') aim(message.what, message.id);
  if (message.kind === 'history') {
    const undo = document.querySelector<HTMLButtonElement>('.cf-undo');
    const redo = document.querySelector<HTMLButtonElement>('.cf-redo');
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
