import { DRAG, NOTHING, endSpotOf, fineOf, sameFine, sameSpot, spotOf, start, step, topOf } from './mapState.ts';
import { createPreviewGate } from './previewGate.ts';
import type { Event, Fine, Focus, Ghost, Picked, Spot, State, Under } from './mapState.ts';
import type { PanelChrome } from '../panelHtml.ts';

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

/**
 * 拡張への送り口の門。**試し当ては 1 つずつ送る** (決め事は `previewGate.ts`)。
 * カーソルの動く速さではなく、答えの返る速さで往復が決まるようにする。
 */
/**
 * **門が実際に送った試し当て。** 待たせているものは入らない (答えは 1 つずつしか
 * 来ないので、返ってきた答えが訊いていた場所はこれで引ける)。カーソルが先へ
 * 進んでいても答えを採り、進んだ分を図の上でずらすために要る。
 */
let asked: { readonly key: string; readonly at: Spot } | null = null;

const gate = createPreviewGate((message) => {
  if (message.kind === 'preview' && typeof message['to'] === 'string') {
    asked = { key: String(message['key']), at: { cell: message['to'], fine: (message['fine'] as Fine) ?? null } };
  }
  vscode.postMessage(message);
});

/**
 * 起動のときの能力表。**言語をまたぐと入れ替わる**ので body ではなく語彙の箱に書いてある
 * (2 度目からは `map` の知らせが `chrome` として運ぶ)。空も NaN も「刻めない」に落ちる。
 */
const firstChrome = document.querySelector<HTMLElement>('.cf-chrome-palette');
let state: State = start(
  document.body.classList.contains('cf-own-undo'),
  firstChrome?.dataset.folds === '1',
  Number(firstChrome?.dataset.fine) || null,
  firstChrome?.dataset.fineFor === 'note' ? 'note' : 'all',
);

/** 最後に見たカーソルの位置。組み直しのあとにカーソルの下を取り直す。 */
let pointer: { x: number; y: number } | null = null;

const query = <T extends Element>(selector: string): T | null => document.querySelector<T>(selector);

/** 端数を符号つきの短い数に (`0.3` → `+.3`、`0` → `0`)。 */
const signed = (value: number): string =>
  (value === 0 ? '0' : `${value < 0 ? '-' : '+'}${String(Math.abs(value)).replace(/^0/, '')}`);

const setText = (selector: string, text: string): void => {
  const target = query(selector);
  if (target) target.textContent = text;
};

// ---------------------------------------------------------------- ズーム・パン

/**
 * 図の見え方。**組み直しても保つ。**
 *
 * **動かすのはスクロールで、変形ではない。** 平行移動を `transform` で掛けると
 * 箱の中身は動くが**大きさが変わらない**ので、ブラウザにスクロールバーを
 * 出す手がかりが無い。図の外側の箱を拡大の分だけ広げて、はみ出したぶんを
 * ブラウザに送らせる (実機で「スクロールバーを常に出す」と頼まれた)。
 */
const view = { zoom: 1 };
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 8;
const WHEEL_STEP = 1.1;
/** 落ち先の四角の最小の辺 (升の座標系)。これより小さいと見えない。 */
const SMALLEST_FINE_BOX = 6;
/** 触れている穴の輪の半径 (升の何倍か)。**穴の丸 (半径 4.5) より外**に置く。 */
const HOLE_MARK = 0.3;
const KEY_STEP = 1.25;

/**
 * 図ではない殻の部分。**ここを押しても図を押したことにしない** (選択が外れる)。
 *
 * **右クリックの一覧 (`.kc-menu`) も殻。** 図の上に重ねて出しているので、
 * 入れておかないと項目を押した瞬間に「図の空きを押した」になり、選んだものが
 * 外れてから鍵が走る — 実機で「右メニューが効かない」と言われたのがこれ。
 */
const CHROME = '.kc-chooser, .kc-props, .kc-top, .kc-tools, .kc-band, .kc-status, .kc-menu';

const canvas = (): HTMLElement | null => query<HTMLElement>('.kc-canvas');
/**
 * 図の場。**浮かぶもの (右クリックの一覧・部品の窓・囲みの帯) の座標はここが基準。**
 * 図の箱 (`kc-canvas`) は中身ごとスクロールするので、そちらを基準にすると
 * 図と一緒に流れ、スクロールしたぶんだけ押した所からずれる
 * (実機で「右メニューが出ない」「範囲選択のシャドウが出ない」)。
 */
const stage = (): HTMLElement | null => query<HTMLElement>('.kc-stage');

/**
 * 図の幅を決め直す。**100 % は「箱の幅にちょうど」** — 図は幅に合わせて
 * 描かれるので、そこを起点に倍率を掛ける。スクロールバーの出た分だけ箱が
 * 狭くなるので、内側の幅 (`clientWidth`) で数える。
 */
function applyView(): void {
  const body = query<HTMLElement>('.cf-body');
  const box = canvas();
  if (body !== null && box !== null) body.style.width = `${box.clientWidth * view.zoom}px`;
  setText('.kc-zoom', `${Math.round(view.zoom * 100)} %`);
}

/** カーソルの位置を中心にズーム (その点が動かないようにスクロールを直す)。 */
function zoomAt(factor: number, cx: number, cy: number): void {
  const box = canvas();
  const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, view.zoom * factor));
  if (box === null || next === view.zoom) {
    view.zoom = next;
    applyView();
    return;
  }
  // カーソルの下の点を図の座標で覚えておき、広げたあとに同じ点へ戻す。
  const ratio = next / view.zoom;
  const [atX, atY] = [box.scrollLeft + cx, box.scrollTop + cy];
  view.zoom = next;
  applyView();
  box.scrollLeft = atX * ratio - cx;
  box.scrollTop = atY * ratio - cy;
}

function zoomAtCenter(factor: number): void {
  const box = canvas()?.getBoundingClientRect();
  zoomAt(factor, (box?.width ?? 0) / 2, (box?.height ?? 0) / 2);
}

/**
 * 全体を出す。**中身の高さに合わせる** — 図は箱の幅に合わせて描かれるので、
 * 100 % でも縦がはみ出ることがある (細いパネル、縦長の板)。スクロールで
 * 追えるようにはなったが、**一度に全部見たい**ときのための道は残す。
 */
function fit(): void {
  const box = canvas();
  view.zoom = 1;
  applyView();
  if (box !== null) {
    box.scrollLeft = 0;
    box.scrollTop = 0;
  }

  const height = query<HTMLElement>('.cf-body')?.getBoundingClientRect().height ?? 0;
  if (box === null || height === 0) return;
  const scale = Math.min(1, box.clientHeight / height);
  if (scale >= 1) return;
  view.zoom = Math.max(ZOOM_MIN, scale);
  applyView();
}

/** キャンバスの中の座標 (ズームの中心に使う)。 */
function inCanvas(event: { clientX: number; clientY: number }): { x: number; y: number } {
  const box = canvas()?.getBoundingClientRect();
  return { x: event.clientX - (box?.left ?? 0), y: event.clientY - (box?.top ?? 0) };
}

let panning: { x: number; y: number; left: number; top: number } | null = null;
let spaceHeld = false;

// ---------------------------------------------------------------- 指

/**
 * 指で触るときの決め (52 の docs/32)。**1 本の意味はマウスと同じ**に保ち、
 * 移動と拡大は 2 本へ寄せる。1 本と 2 本は混じらないので取り合いにならない。
 *
 * | 指 | すること |
 * | --- | --- |
 * | 1 本でなぞる | 今までどおり (何もない所からなら囲み、物の上からなら動かす) |
 * | 2 本でなぞる | 図を移動する |
 * | 2 本を開く・閉じる | 拡大・縮小 |
 * | 長押し | 右メニュー |
 */
const LONG_PRESS = 500;
/** 長押しと見なす動きの幅。指は静かに置いても少し揺れる。 */
const LONG_PRESS_SLACK = 10;

/** いま触れている指。 */
const fingers = new Map<number, { readonly x: number; readonly y: number }>();
/**
 * 2 本指のなぞり。**間合いは始めたときのものを覚える** — 指は同時には動かず、
 * 出来事は 1 本ずつ来る。前の出来事との比で拡大すると、片方が動いた瞬間だけ
 * 間合いが伸びて拡大が揺れる。始めからの比なら、もう片方が追いついた時点で
 * 正しい倍率に戻る。真ん中のほうは移動なので、前の出来事との差でよい。
 */
let pinch: {
  readonly gap: number;
  readonly zoom: number;
  x: number;
  y: number;
} | null = null;
/** 長押しの見張り。動いたか離したら取り消す。 */
/** `setTimeout` の返しは殻 (DOM) と node で型が違うので、そのまま借りる。 */
type Timer = ReturnType<typeof setTimeout>;
let pressing: { readonly id: number; readonly x: number; readonly y: number; readonly timer: Timer } | null = null;

/** 2 本指の間合いと真ん中。指が 2 本無ければ null。 */
function spanOf(): { readonly gap: number; readonly x: number; readonly y: number } | null {
  const [one, two] = [...fingers.values()];
  if (one === undefined || two === undefined) return null;
  return {
    gap: Math.hypot(two.x - one.x, two.y - one.y),
    x: (one.x + two.x) / 2,
    y: (one.y + two.y) / 2,
  };
}

/** なぞりの始め。いまの倍率も覚える (始めからの比で拡大するため)。 */
function startPinch(): void {
  const span = spanOf();
  pinch = span === null ? null : { gap: span.gap, zoom: view.zoom, x: span.x, y: span.y };
}

const dropLongPress = (): void => {
  if (pressing !== null) clearTimeout(pressing.timer);
  pressing = null;
};

/** 指を置いたら長押しを数え始める。**図の上だけ** (道具や欄では数えない)。 */
function watchLongPress(event: PointerEvent): void {
  dropLongPress();
  if (elementOf(event)?.closest('.kc-canvas') == null) return;
  const [x, y] = [event.clientX, event.clientY];
  pressing = {
    id: event.pointerId,
    x,
    y,
    timer: setTimeout(() => {
      pressing = null;
      // **指の下のものに効かせる。** 押しかけは畳んでから開く (帯が残らない)。
      band = null;
      hideBand();
      run({ kind: 'cancel' });
      openMenu(x, y);
    }, LONG_PRESS),
  };
}

/** 動いたら長押しではない (なぞりの始まり)。 */
function stirLongPress(event: PointerEvent): void {
  if (pressing === null || pressing.id !== event.pointerId) return;
  if (Math.abs(event.clientX - pressing.x) + Math.abs(event.clientY - pressing.y) > LONG_PRESS_SLACK) {
    dropLongPress();
  }
}

/**
 * 2 本指で動かす。**真ん中の動きで移動、間合いの伸び縮みで拡大。**
 * 先に移動を当ててから拡大する — 拡大は真ん中の点を止めたまま広げるので、
 * 順を逆にすると止める点が古いままになる。
 */
function pinchTo(): void {
  const now = spanOf();
  const box = canvas();
  if (now === null || pinch === null || box === null) return;
  box.scrollLeft -= now.x - pinch.x;
  box.scrollTop -= now.y - pinch.y;
  pinch.x = now.x;
  pinch.y = now.y;
  if (pinch.gap <= 0 || now.gap <= 0) return;
  // **始めからの比で倍率を決める。** `zoomAt` は掛け算で受けるので、
  // いまの倍率から目当ての倍率までの比に直して渡す。
  const wanted = pinch.zoom * (now.gap / pinch.gap);
  const frame = box.getBoundingClientRect();
  zoomAt(wanted / view.zoom, now.x - frame.left, now.y - frame.top);
}

/** その出来事が指か。マウスとペンは今までどおり 1 つの道を通る。 */
const byFinger = (event: PointerEvent): boolean => event.pointerType === 'touch';
/**
 * `Shift` を押しているか。**升ちょうどに吸い付ける**ためと、**引いている線の影を
 * 折って見せる**ために持つ。
 *
 * 刻みは**既定が 1/`fine` 升**で、`Shift` を押している間だけ升ちょうど
 * (実機で「Ctrl なしでも 1/10 単位で移動する」「SHIFT を押しているときには
 * 枡単位で動く」。前は逆で、`Ctrl` を押している間だけ細かかった)。
 */
let shiftHeld = false;

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
  const find = (selector: string, name: string): { readonly hit: HTMLElement; readonly value: string } | null => {
    for (const element of stack) {
      const hit = element.closest<HTMLElement>(selector);
      const value = hit?.dataset[name];
      if (hit != null && value !== undefined) return { hit, value };
    }
    return null;
  };
  const cell = find('.cf-cell', 'address');
  const chip = find('.cf-chip', 'part');
  return {
    cell: cell?.value ?? null,
    part: chip?.value ?? null,
    // **注釈かどうかは絵が言う** (`data-note`)。端数が注釈にだけ効く板で要る。
    note: chip?.hit.dataset.note === '1',
    node: find('.cf-dot', 'node')?.value ?? null,
    wire: find('.cf-wire-hit', 'line')?.value ?? null,
    // 配線の**端**。線そのものより上にあるので、端の上では端が勝つ。
    wireEnd: (() => {
      const found = find('.cf-wire-end', 'line');
      const end = found?.hit.dataset.end;
      return found === null || end === undefined ? null : { line: found.value, end: end as 'from' | 'to' };
    })(),
    pin: find('.cf-pin-hit', 'pin')?.value ?? null,
    fine: cell === null ? null : fineIn(cell.hit, x, y),
  };
}

/**
 * 升の四角の中の端数。**端数を受けるフェンスでだけ**数える。
 * 四角はピッチちょうどで隙間なく敷かれている (circuit の `mapSvg` のテストが見張る)。
 * 交点ちょうどは null (端数が無ければ知らせは今までと同じ)。
 *
 * **`Shift` を押している間は数えない** — そのあいだは升ちょうどに吸い付く。
 */
function fineIn(cell: Element, x: number, y: number): Fine | null {
  // 端数が絵に出るのは、持ち物があるときと配線を引きかけているときだけ。
  // それ以外で数えると、何も変わらない塗り直しが 1 升あたり 100 回になる。
  const wanted = state.carry !== null || state.wireFrom !== null;
  // **端数が効く相手のときだけ数える。** 板の 2 つは足を穴に挿すので、
  // 刻めるのは注釈だけ (`fineFor`)。刻めない物に小さい四角を出すと、
  // そこへ置けるように見えて置けない。
  const takesFine = state.fineFor === 'all'
    || (state.carry?.kind === 'move' && state.carry.note === true);
  if (shiftHeld || state.fine === null || !wanted || !takesFine) return null;
  const box = cell.getBoundingClientRect();
  const fine = fineOf(x - box.left, y - box.top, box.width, box.height, state.fine);
  return fine.rows === 0 && fine.cols === 0 ? null : fine;
}

const sameUnder = (a: Under, b: Under): boolean =>
  a.cell === b.cell && a.part === b.part && a.node === b.node && a.wire === b.wire && a.pin === b.pin
  && sameFine(a.fine, b.fine);

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

/**
 * 付けた印の控え。**外すときに図ぜんぶを探し直さない。**
 *
 * 印は 7 種類あり、カーソルが動くたびに全部いったん外して付け直すので、
 * そのたびに `querySelectorAll` を図ぜんぶに 7 回まわしていた
 * (52 の docs/27 の実測)。印を付けるのはこの殻だけで、図の側 (フェンスが
 * 組んだ markup) は付けてこないので、控えだけ見れば足りる。
 */
const marked = new Map<string, Element[]>();

const mark = (element: Element | null | undefined, className: string): void => {
  if (element === null || element === undefined) return;
  element.classList.add(className);
  const kept = marked.get(className);
  if (kept === undefined) marked.set(className, [element]);
  else kept.push(element);
};

const unmark = (className: string): void => {
  const kept = marked.get(className);
  if (kept === undefined) return;
  for (const element of kept) element.classList.remove(className);
  kept.length = 0;
};

/**
 * 選んだものを囲む枠。**中の線を塗り替えるだけでは足りない** —
 * circuit のマップは記号なので線に色を付ければ分かるが、breadboard と
 * perfboard の `.cf-chip` は**実物の姿そのもの**で、中に塗り替える線が無く、
 * あっても部品の色に紛れる (実機で「選択が分かりにくい」と指摘された)。
 * 姿に依らない外枠なら、どのフェンスでも同じように分かる。
 */
/**
 * いま出ている枠と、その相手。**同じものを選んだままなら作り直さない** —
 * 作り直すと `getBBox` (レイアウト) と合成層の組み直しが 1 動きごとに走る。
 */
let heldBox: { readonly around: SVGGraphicsElement; readonly node: SVGRectElement } | null = null;

const dropHeldBox = (): void => {
  heldBox?.node.remove();
  heldBox = null;
};

function frameSelected(shown: Element | null): void {
  const around = shown instanceof SVGGraphicsElement && shown.classList.contains('cf-chip') ? shown : null;
  if (around === null) {
    dropHeldBox();
    return;
  }
  // 図を組み直すと要素そのものが入れ替わるので、**同じ物か**は要素で見る。
  if (heldBox !== null && heldBox.around === around && heldBox.node.isConnected) return;
  dropHeldBox();

  const box = around.getBBox();
  if (box.width === 0 && box.height === 0) return;
  const frame = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  frame.setAttribute('class', 'cf-held-box');
  frame.setAttribute('x', String(box.x - HELD_PAD));
  frame.setAttribute('y', String(box.y - HELD_PAD));
  frame.setAttribute('width', String(box.width + HELD_PAD * 2));
  frame.setAttribute('height', String(box.height + HELD_PAD * 2));
  // **同じ姿勢で描く**: getBBox は要素自身の transform を含まないので、写して合わせる。
  const posture = around.getAttribute('transform');
  if (posture !== null) frame.setAttribute('transform', posture);
  // 手前に置く。部品が重なっていても枠が隠れない (当たり判定は CSS で外す)。
  around.after(frame);
  heldBox = { around, node: frame };
}

function markSelected(picked: Picked | null, also: readonly Picked[] = []): void {
  unmark('cf-held');
  // **まとめて選んだものは全部光らせる。** 枠を出すのは押した 1 つだけ
  // (全部に枠を出すと、どれを軸に動かすのか読めない)。
  for (const one of also) mark(shownFor(one), 'cf-held');
  const shown = shownFor(picked);
  mark(shown, 'cf-held');
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
  mark(shownFor(topOf(now.under)), 'cf-hover');
}

/**
 * 引いた穴の控え。**穴は図を組み直すまで動かない**ので、番地から引いた要素も
 * その四角も覚えておく。`getBBox` はレイアウトを起こすので、1 動きに 3 回払うと
 * 効いてくる (52 の docs/27)。控えは組み直しで捨てる (`forgetPainted`)。
 */
const cellsSeen = new Map<string, SVGGraphicsElement | null>();
const boxesSeen = new Map<string, DOMRect>();

/** その番地の当たり判定の四角。端数の番地 (`b2c7f5`) には無い。 */
const cellElement = (address: string): SVGGraphicsElement | null => {
  const known = cellsSeen.get(address);
  if (known !== undefined) return known;
  const found = query<SVGGraphicsElement>(`.cf-cell[data-address="${CSS.escape(address)}"]`);
  cellsSeen.set(address, found);
  return found;
};

/**
 * その穴の四角 (図の座標)。**まだ描かれていないときは覚えない** — 隠れている
 * webview の `getBBox` は 0 を返すので、覚えると出てきたときに 0 のままになる。
 */
const cellBox = (address: string): DOMRect | null => {
  const known = boxesSeen.get(address);
  if (known !== undefined) return known;
  const element = cellElement(address);
  if (element === null) return null;
  const box = element.getBBox();
  if (box.width === 0 && box.height === 0) return box;
  boxesSeen.set(address, box);
  return box;
};

/** 四角の真ん中 (その要素自身の座標)。 */
const middleOf = (box: DOMRect): { readonly x: number; readonly y: number } =>
  ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });

/** 端数の落ち先の四角。**1 つを使い回す** (塗り直しのたびに作らない。板では作られない)。 */
let fineBox: SVGRectElement | null = null;

/** 触れている穴の輪。**1 つを使い回す** (塗り直しのたびに作らない)。 */
let holeMark: SVGCircleElement | null = null;

/**
 * カーソルが触れている穴の印。配線を引くとき・物を持っているときに出す
 * (どの穴に落ちるかが、押す前に見えるようにするためのもの)。
 *
 * **穴を塗り潰さない。** 当たり判定の四角は升ちょうどなので、そこを塗ると
 * 穴そのものがカーソルの下に隠れる (実機で「■で穴が隠れる」)。
 * 升より小さい輪を穴の真ん中に置き、中は空けておく。
 */
function markHole(now: State): void {
  const wanted = now.tool === 'wire' || now.carry !== null;
  const at = wanted ? spotPoint(spotOf(now, now.under)) : null;
  const cell = now.under.cell;
  const element = cell === null ? null : cellElement(cell);
  const box = cell === null ? null : cellBox(cell);
  if (at === null || element === null || box === null) {
    holeMark?.remove();
    return;
  }
  const ring = holeMark ?? document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  holeMark = ring;
  ring.setAttribute('class', 'cf-hole-mark');
  ring.setAttribute('cx', String(at.x));
  ring.setAttribute('cy', String(at.y));
  ring.setAttribute('r', String(box.width * HOLE_MARK));
  // 升の四角と同じ層に置く (同じ座標系で描ける)。
  element.after(ring);
}

/** ゴースト — 置く・動かす先の穴を光らせる。置けないときは赤。 */
function markGhost(now: State): void {
  unmark('cf-ghost');
  unmark('cf-ghost-bad');
  if (now.carry === null || now.ghost === null) {
    fineBox?.remove();
    return;
  }
  const className = now.ghost.ok ? 'cf-ghost' : 'cf-ghost-bad';
  for (const cell of now.ghost.cells) mark(cellElement(cell), className);
  markFineBox(now, now.ghost.ok);
}

/** 端数の落ち先 (図の座標) と四角の大きさ。端数が無ければ null。 */
function fineSpot(now: State): { readonly cell: Element; readonly x: number; readonly y: number; readonly size: number } | null {
  const { cell, fine } = now.under;
  if (cell === null || fine === null || now.fine === null) return null;
  const element = cellElement(cell);
  const box = cellBox(cell);
  if (element === null || box === null) return null;
  // 刻みが細かいと 1/`fine` の四角は見えなくなる (升 34 に対して 1/10 は 3.4)。
  // **落ち先が見えることのほうが大事**なので、下限を置く。
  const size = Math.max(box.width / now.fine, SMALLEST_FINE_BOX);
  return { cell: element, ...offsetBy(middleOf(box), box, fine), size };
}

/**
 * 端数の落ち先。**端数の升は DOM に無い**ので、押した升の中心から端数ぶんずらした所に
 * 1/`fine` の小さい四角を出す (52 の docs/23)。どこに落ちるかが押す前に見える。
 */
function markFineBox(now: State, ok: boolean): void {
  const spot = fineSpot(now);
  if (spot === null) {
    fineBox?.remove();
    return;
  }
  const box = fineBox ?? document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  fineBox = box;
  box.setAttribute('class', `cf-fine-box${ok ? '' : ' cf-fine-box-bad'}`);
  box.setAttribute('x', String(spot.x - spot.size / 2));
  box.setAttribute('y', String(spot.y - spot.size / 2));
  box.setAttribute('width', String(spot.size));
  box.setAttribute('height', String(spot.size));
  // 升の四角と同じ層に置く (同じ座標系で描ける)。
  spot.cell.after(box);
}

/** 穴 1 つの真ん中 (図の座標)。当たり判定の四角から読む。 */
function cellCentre(address: string): { readonly x: number; readonly y: number } | null {
  const box = cellBox(address);
  return box === null ? null : middleOf(box);
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
/**
 * 運ぶ絵をずらす量 (図の座標)。**穴の要素から測るのが先** — 板の当たり判定は
 * ピッチの 0.9 倍なので、幅から数えると狂う。端数の升は DOM に無い (circuit だけ) ので、
 * そのときは拡張が添えた `shift` (升の数) を升の幅に掛ける (circuit の升はピッチちょうど)。
 */
function shiftOf(ghost: Ghost): { readonly x: number; readonly y: number } | null {
  const from = anchorOf(ghost.from ?? []);
  const to = anchorOf(ghost.cells);
  if (from !== null && to !== null) return { x: to.x - from.x, y: to.y - from.y };
  if (ghost.shift === undefined) return null;
  const unit = unitBox();
  return unit === null ? null : offsetBy({ x: 0, y: 0 }, unit, ghost.shift);
}

/** 升 1 つの大きさ (どの穴でも同じ)。**番地を知らないとき**の物差しに使う。 */
let unitSize: DOMRect | null = null;

function unitBox(): DOMRect | null {
  if (unitSize !== null) return unitSize;
  const box = query<SVGGraphicsElement>('.cf-cell')?.getBBox();
  if (box === undefined || (box.width === 0 && box.height === 0)) return box ?? null;
  unitSize = box;
  return box;
}

/** 升の中心から端数ぶんずらす (升の四角の幅で数える)。足には端数が無い。 */
function offsetBy(
  centre: { readonly x: number; readonly y: number },
  box: DOMRect,
  fine: Fine | null,
): { readonly x: number; readonly y: number } {
  if (fine === null) return centre;
  return { x: centre.x + fine.cols * box.width, y: centre.y + fine.rows * box.height };
}

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

/**
 * いま出ている運ぶ絵と、その元。**運んでいるあいだは作り直さない** —
 * 姿は変わらず場所だけが変わるので、消して作り直すと穴をまたぐたびに
 * 合成層が組み直る (52 の docs/27 の実測で 1 回 2.2 ms)。
 */
let carried: { readonly of: SVGGraphicsElement; readonly node: SVGGraphicsElement } | null = null;

const dropCarried = (): void => {
  carried?.node.remove();
  carried = null;
};

/**
 * 運ぶ絵を用意する。**元が同じなら写しを使い回す。**
 * 姿が変わるとき (回した・間隔を変えた・図を組み直した) は元の要素そのものが
 * 入れ替わるので、要素で見分ければ足りる。
 */
function ghostChipOf(held: SVGGraphicsElement): SVGGraphicsElement {
  if (carried !== null && carried.of === held && carried.node.isConnected) return carried.node;
  dropCarried();

  const ghost = held.cloneNode(true) as SVGGraphicsElement;
  // 掴む印は写さない (ゴーストは掴めない。名札が 2 つあると選ぶ先が狂う)。
  ghost.removeAttribute('data-part');
  for (const one of ghost.querySelectorAll('[data-part]')) one.removeAttribute('data-part');
  // **図の中へ入れる。** 置くときの絵は図の外で組んであるので、入れ先は
  // 図にある部品の親 (無ければ図そのもの) にする。
  const into = query('.cf-chip')?.parentNode ?? query('svg');
  (into as Element | null)?.appendChild(ghost);
  carried = { of: held, node: ghost };
  return ghost;
}

/** 穴を持たないもの (帯に並べた板の外の機器) か。ずらす基準になる穴が無い。 */
const holeless = (ghost: Ghost): boolean =>
  ghost.cells.length === 0 && (ghost.from ?? []).length === 0;

/**
 * 持ち物を掴んだときのカーソルの位置 (画面の座標)。
 * **穴を持たないものの影はここからの差で動かす。**
 *
 * 板の外の機器は帯に並ぶので指せる穴が無く (`cellsOf` が空)、拡張の答えには
 * ずらす基準が入ってこない — 影が出ないまま「動かせない」に見えていた
 * (実機で「基板外のデバイスをマウスで動かせるようにする」)。
 * **升では数えられない** (掴んだとき、カーソルは板の外に居る) ので、
 * 画面の座標で数えて図の座標へ落とす。
 */
let carriedFrom: { readonly x: number; readonly y: number } | null = null;

/** 掴んだ・放したを控える。**掴み直したときだけ**基準を取り直す。 */
function noteCarry(before: State['carry'], now: State): void {
  if (now.carry === null) carriedFrom = null;
  else if (before === null) carriedFrom = pointer;
}

/** 画面の座標を図の座標へ。図が無い・行列が取れないときは null。 */
function userPoint(at: { readonly x: number; readonly y: number } | null): { readonly x: number; readonly y: number } | null {
  if (at === null) return null;
  const svg = query<SVGSVGElement>('.cf-body svg');
  const screen = svg?.getScreenCTM();
  if (svg === null || screen === null || screen === undefined) return null;
  const point = new DOMPoint(at.x, at.y).matrixTransform(screen.inverse());
  return { x: point.x, y: point.y };
}

/** 穴を持たないものの動いた量 (掴んだ所からカーソルまで)。数えられなければ null。 */
function floatingShift(): { readonly x: number; readonly y: number } | null {
  const at = userPoint(carriedFrom);
  const to = userPoint(pointer);
  return at === null || to === null ? null : { x: to.x - at.x, y: to.y - at.y };
}

/**
 * その場所 (端数つき) の図の座標。穴が図に無ければ null。
 */
function spotPoint(spot: Spot | null): { readonly x: number; readonly y: number } | null {
  if (spot === null || spot.cell === null) return null;
  const box = cellBox(spot.cell);
  return box === null ? null : offsetBy(middleOf(box), box, spot.fine);
}

/**
 * **答えが追いつくまでの差。** ゴーストは「訊いた穴」の答えで、そのあいだに
 * カーソルは何升も先へ進んでいる。往復を待って絵を動かすと、影は答えの数だけ
 * しか動かない (実機で「部品を移動中の反応が悪い。マウス追従をスムーズに」)。
 *
 * 升は一様なので、**進んだ分は図の上で足せる** — 拡張に訊き直さずに済む。
 * 答えが来たら差は 0 に戻り、絵はそのまま正しい場所に居る。
 */
function leadOf(now: State): { readonly x: number; readonly y: number } {
  const at = spotPoint(now.ghostAt);
  const to = spotPoint(spotOf(now, now.under));
  if (at === null || to === null) return { x: 0, y: 0 };
  return { x: to.x - at.x, y: to.y - at.y };
}

function markCarried(now: State): void {
  unmark('cf-lifted');
  // **引き直している線は薄くする。** 行き先の影 (`markWireGhost`) と二重に
  // 見えないように — 部品を持ち上げたときと同じ見せ方に揃える。
  if (now.carry?.kind === 'wireEnd') {
    mark(query(`.cf-wire[data-line="${CSS.escape(now.carry.line)}"]`), 'cf-lifted');
  }
  if (now.carry === null || now.ghost === null) {
    dropCarried();
    return;
  }

  // 動かすときは**図にある絵を写す**。置くときは拡張が寄こした絵を使う
  // (図にまだ無い部品なので、写す先が無い)。
  const held = now.carry.kind === 'move'
    ? query<SVGGraphicsElement>(`.cf-chip[data-part="${CSS.escape(now.carry.part)}"]`)
    : now.carry.kind === 'place' && now.ghost.chip !== undefined
      ? chipFrom(now.ghost.chip)
      : null;
  // 穴どうしの差が数えられればそれ (答えが遅れている分は `leadOf` が足す)。
  // **穴を持たないものはカーソルに付いてくる** — 掴んだ所からの差で動かす。
  const answered = held === null ? null : shiftOf(now.ghost);
  const lead = leadOf(now);
  const moved = held === null
    ? null
    : answered !== null
      ? { x: answered.x + lead.x, y: answered.y + lead.y }
      : holeless(now.ghost) ? floatingShift() : null;
  if (held === null || moved === null) {
    dropCarried();
    return;
  }
  // 持ち上げたものは薄くする。**行き先の絵と二重に見えない**ように。
  if (now.carry.kind === 'move') mark(held, 'cf-lifted');

  const ghost = ghostChipOf(held);
  ghost.setAttribute('class', `cf-ghost-part${now.ghost.ok ? '' : ' cf-ghost-part-bad'}`);
  // **元の姿勢の前にずらしを足す** (部品が自分の transform を持っていても壊さない)。
  const posture = held.getAttribute('transform');
  const shift = `translate(${moved.x} ${moved.y})`;
  ghost.setAttribute('transform', posture === null ? shift : `${shift} ${posture}`);
}

/** いま置こうとしている部品。パレットのどれを押したかを見せる。 */
function markChosen(now: State): void {
  unmark('cf-chosen');
  if (now.carry?.kind !== 'place') return;
  for (const element of document.querySelectorAll(`.cf-pick[data-type="${CSS.escape(now.carry.type)}"]`)) {
    mark(element, 'cf-chosen');
  }
}

/**
 * 配線の色見本。**配線に触っているときだけ出す** — 道具が配線か、選んだものが
 * 配線か、引きかけているとき。いつも出しておくと、部品を直しているときに
 * 関わりのない色の並びが欄の下に居座る。
 *
 * 押した色は枠で示す (実機で「固定の色パレット」。開かずに色が見えることと、
 * いま何色で引くのかが見えることの 2 つが要る)。
 */
function markInk(now: State): void {
  const box = query<HTMLElement>('.cf-colors');
  if (box === null) return;
  const swatches = document.querySelectorAll<HTMLElement>('.cf-swatch');
  const wanted = swatches.length > 0
    && (now.tool === 'wire' || now.wireFrom !== null
      || now.selected?.kind === 'wire' || now.also.some((one) => one.kind === 'wire'));
  box.hidden = !wanted;
  if (!wanted) return;
  for (const swatch of swatches) {
    swatch.classList.toggle('cf-inked', swatch.dataset.color === now.ink);
  }
}

/**
 * 配線の端 1 つの場所 (図の座標)。**穴でも足でもよい** — 綴りはフェンスのもの
 * なので、両方の名札を当たってみる。どちらでもなければ null。
 */
function endElement(spelling: string): SVGGraphicsElement | null {
  return cellElement(spelling) ?? query<SVGGraphicsElement>(`.cf-pin-hit[data-pin="${CSS.escape(spelling)}"]`);
}

/**
 * その要素の真ん中を、**図の座標**で返す。
 *
 * `getBBox` が返すのは**その要素自身の中の座標**なので、入れ子の `<g>` に
 * `translate` が掛かっているもの (足の丸は部品の中にいる) は原点の近くの値に
 * なる。そのまま線を引くと、**図の左上から線が伸びる**
 * (実機で「配線しているとときどき左上にシャドウが伸びる」)。
 *
 * 画面の座標を挟んで図の座標へ戻すと、途中の `translate` も `rotate` も
 * まとめて効く。まだ描かれていない (行列が無い) ときは諦めて null。
 */
function centreOf(element: SVGGraphicsElement): { readonly x: number; readonly y: number; readonly box: DOMRect } | null {
  const svg = element.ownerSVGElement;
  const toScreen = element.getScreenCTM();
  const fromScreen = svg?.getScreenCTM()?.inverse();
  if (svg === null || toScreen === null || fromScreen === undefined) return null;

  const box = element.getBBox();
  const middle = middleOf(box);
  const at = new DOMPoint(middle.x, middle.y)
    .matrixTransform(toScreen)
    .matrixTransform(fromScreen);
  return Number.isFinite(at.x) && Number.isFinite(at.y) ? { x: at.x, y: at.y, box } : null;
}

/**
 * 配線の 1 点目。2 点目を押すまで印を出しておく。
 */
function markWireFrom(now: State): void {
  unmark('cf-from');
  if (now.wireFrom === null) return;
  mark(endElement(now.wireFrom.cell), 'cf-from');
}

/** 引いている最中の配線の影。**引き終わると消える** ので、図には残らない。 */
const GHOST_WIRE = 'cf-ghost-wire';

/**
 * 1 点目を押してから 2 点目を押すまでのあいだ、**引かれる線を先に見せる**
 * (実機で頼まれた)。折れる指定 (`Shift`) も同じ形で見せるので、
 * 押す前に「どちらに折れるか」が分かる。
 *
 * 線は**カーソルの下の穴・足まで**引く。生のカーソル位置まで引くと、
 * 見えている線と実際に書かれる線が食い違う (書かれるのは穴と穴の間)。
 */
/** 引いている最中の線。**1 本を使い回す** (端数の四角と同じ理由で、作り直さない)。 */
let wireGhost: SVGPolylineElement | null = null;

/**
 * 影を入れる層。**`.cf-wires` を持つのは circuit だけ** — 板の 2 つのマップは
 * 実物の図を掴ませているので、その名前の層が無い。無ければ図の根へ入れる。
 *
 * 座標はどちらでも同じ: `centreOf` が返すのは図の根の座標で、circuit の層は
 * 変形を持たない (`mapSvg.ts` の `layer`)。影は当たり判定を持たない
 * (`pointer-events: none`) ので、根に置いても掴む先は変わらない。
 *
 * これが無かったので、**板では引いている最中の線が出ていなかった** (52 の docs/27)。
 */
const wireLayer = (): Element | null => query('.cf-wires') ?? query('.cf-body > svg');

/** その配線の**動かさないほうの端**の場所 (図の座標)。読めなければ null。 */
function heldEnd(line: string, moving: 'from' | 'to'): { readonly x: number; readonly y: number } | null {
  const other = moving === 'from' ? 'to' : 'from';
  const shown = query<SVGGraphicsElement>(
    `.cf-wire-end[data-line="${CSS.escape(line)}"][data-end="${other}"]`,
  );
  return shown === null ? null : centreOf(shown);
}

/**
 * 影の両端 (図の座標)。**2 通りある** — 新しく引いている最中 (1 点目 → カーソル) と、
 * 端を引き直している最中 (動かさないほうの端 → カーソル)。
 *
 * 端の引き直しには**影が出ていなかった** — 光る穴だけでは、どちらの端が
 * どこへ付くのかが読めない (実機で「配線の端をドラッグ中にシャドウを表示する」)。
 */
function wireGhostLine(now: State): {
  readonly from: { readonly x: number; readonly y: number };
  readonly to: { readonly x: number; readonly y: number };
} | null {
  const end = now.tool === 'wire' || now.carry?.kind === 'wireEnd' ? endSpotOf(now, now.under) : null;
  if (end === null) return null;
  const finish = endElement(end.cell);
  const toCentre = finish === null ? null : centreOf(finish);
  if (toCentre === null) return null;
  const to = offsetBy(toCentre, toCentre.box, end.fine);

  if (now.carry?.kind === 'wireEnd') {
    const from = heldEnd(now.carry.line, now.carry.end);
    return from === null ? null : { from, to };
  }
  // 同じ升でも端数が違えば別の交点 (書かれる配線と同じ判定)。
  if (now.wireFrom === null || sameSpot(now.wireFrom, end)) return null;
  const start = endElement(now.wireFrom.cell);
  const fromCentre = start === null ? null : centreOf(start);
  if (fromCentre === null) return null;
  return { from: offsetBy(fromCentre, fromCentre.box, now.wireFrom.fine), to };
}

function markWireGhost(now: State): void {
  const layer = wireLayer();
  const line = wireGhostLine(now);
  if (line === null || layer === null) {
    wireGhost?.remove();
    return;
  }
  const { from, to } = line;
  // 折れる指定は先に横 (`-|`)。折れない板では真っ直ぐのまま。
  const corner = shiftHeld && now.foldsWire ? [{ x: to.x, y: from.y }] : [];
  const points = [from, ...corner, to].map((at) => `${at.x},${at.y}`).join(' ');
  const ghost = wireGhost ?? document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  wireGhost = ghost;
  ghost.setAttribute('class', GHOST_WIRE);
  ghost.setAttribute('points', points);
  // 図を組み直すと層そのものが入れ替わるので、そのときだけ入れ直す。
  if (ghost.parentNode !== layer) layer.append(ghost);
}

function paint(now: State): void {
  markSelected(now.selected, now.also);
  markHover(now);
  markGhost(now);
  markCarried(now);
  markChosen(now);
  markInk(now);
  markWireFrom(now);
  markWireGhost(now);
  markHole(now);
  // 道具は CSS が見る目印にする (右の道具の列の光り方、カーソルの形)。
  // **「置く」は道具ではなく持ち物** (`carry`)。CSS から見た顔だけをここで作る。
  document.body.dataset.tool = now.carry?.kind === 'place' ? 'place' : now.tool;
  document.body.classList.toggle('cf-carrying', now.carry !== null);
  // 端数の上では拡張が綴った番地 (`b2c7f5`) を出す。殻は綴りを組めないので、ゴーストの答えから取る。
  const spelled = now.under.fine !== null && now.ghost !== null && now.ghost.ok ? now.ghost.cells[0] : undefined;
  // 綴りだけでは何段ずれているかが読みにくいので、数でも添える (`b2d7 (+.3, +.7)`)。
  const offset = now.under.fine === null ? '' : ` (${signed(now.under.fine.rows)}, ${signed(now.under.fine.cols)})`;
  setText('.kc-cell', `${spelled ?? now.under.cell ?? ''}${now.under.cell === null ? '' : offset}`);
}

/**
 * 塗り直しの予約。**1 フレームに 1 回**にまとめる — カーソルが 1 回動くと、
 * ホバーで 1 度、拡張から返ったゴーストでもう 1 度、続けて塗っていた。
 * どちらも「いまの状態」を映すので、フレームの終わりに 1 回で足りる。
 *
 * **遅らせても掴む先は変わらない。** 印も枠も影も当たり判定を持たない
 * (CSS の `pointer-events: none`) ので、カーソルの下 (`elementsFromPoint`) は
 * 塗る前と後で同じものを返す。
 */
let painting: number | null = null;

function paintSoon(): void {
  if (painting !== null) return;
  painting = requestAnimationFrame(() => {
    painting = null;
    paint(state);
  });
}

/**
 * 図を組み直したときに、控えている印と絵を捨てる。**前の図の要素を抱えたまま
 * にしない** — 中身を入れ替えると、控えの指す先は図から外れた古い要素になる。
 */
function forgetPainted(): void {
  // **捨てる前に外す。** いまは図ごと入れ替わるので外さなくても消えるが、
  // それは呼ぶ側の事情。控えの側で辻褄を合わせておく。
  for (const className of marked.keys()) unmark(className);
  marked.clear();
  cellsSeen.clear();
  boxesSeen.clear();
  unitSize = null;
  dropCarried();
  dropHeldBox();
  wireGhost?.remove();
  wireGhost = null;
  fineBox?.remove();
  fineBox = null;
  holeMark?.remove();
  holeMark = null;
}

// ---------------------------------------------------------------- 選択窓・欄

const chooser = (): HTMLElement | null => query<HTMLElement>('.kc-chooser');
const searchBox = (): HTMLInputElement | null => query<HTMLInputElement>('.cf-search');
const fieldInput = (name: string): HTMLInputElement | null => query<HTMLInputElement>(`.cf-field[name="${name}"]`);

/**
 * 部品の一覧は**属性パネルに据え置き**で、窓の絵を押したときだけ図の上の窓へ移る
 * (実機で「属性パネルに固定で。窓の絵で今までの窓を出す」)。
 * **箱は 1 つだけを動かす** — 2 つ持つと、言語をまたいだときの差し替え
 * (`applyChrome`) や検索の絞り込みが片方にしか効かない。
 */
const palette = (): HTMLElement | null => query<HTMLElement>('.cf-chrome-palette');

function movePalette(into: string): void {
  const box = palette();
  const seat = query(into);
  if (box === null || seat === null || box.parentNode === seat) return;
  seat.append(box);
}

function focusSearch(): void {
  const search = searchBox();
  search?.focus();
  search?.select();
}

function openChooser(): void {
  const box = chooser();
  if (box === null) return;
  movePalette('.kc-chooser-body');
  box.hidden = false;
  focusSearch();
}

function closeChooser(): void {
  const box = chooser();
  movePalette('.kc-dock-body');
  if (box !== null) box.hidden = true;
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
  // **窓は開かない。** 一覧は属性パネルに出ているので、そこの検索欄へ移るだけ。
  if (focus === 'search') focusSearch();
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
  const frame = stage()?.getBoundingClientRect();
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
  const on = elementOf(event);
  // **欄では既定のメニューを残す。** 貼り付けや辞書はブラウザのものが要る。
  if (on?.closest('input, textarea, select') != null) return;

  // **面のどこでも既定のメニューは出さない** (実機で「右クリックしたとき
  // ブラウザのメニューが出ないようにする」)。VS Code の webview には元から
  // 無いので、あちらでは何も変わらない。**図の上だけを止めていたのでは
  // 足りなかった** — こちらのメニューを開いた後、そのメニューの上で右クリック
  // すると素通りして、2 つのメニューが並んで出ていた。
  event.preventDefault();

  // 出すのは図の上だけ (道具や帯の上で出しても、指す相手が無い)。
  if (on?.closest('.kc-canvas') == null) return;
  openMenu(event.clientX, event.clientY);
});

// ---------------------------------------------------------------- 流す

/**
 * 起きたことを流し、返ってきた状態を画面に映す。**その打鍵を握ったか**を返す
 * (握ったものだけ既定の動きを止める)。
 */
function run(event: Event): boolean {
  const held = state.carry;
  const outcome = step(state, event);
  state = outcome.state;
  noteCarry(held, state);
  for (const message of outcome.send) gate.post(message);
  setText('.cf-status', outcome.status);
  paintSoon();
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
 * `Shift` の印を出来事から取り直す。**変わったときだけ升の下を読み直す** —
 * 鍵を押した瞬間はカーソルが動かないので、読み直さないとゴーストが升ちょうどへ
 * 戻らない。窓の外で押して戻ったときは `keydown` が来ないので、pointer の
 * 出来事からも揃える。**影の折れ方も Shift で変わる**ので、一緒に塗り直す。
 */
function syncShift(event: { readonly shiftKey: boolean }): void {
  if (event.shiftKey === shiftHeld) return;
  shiftHeld = event.shiftKey;
  syncHover();
  paintSoon();
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
    stage()?.appendChild(box);
  }
  const frame = stage()?.getBoundingClientRect();
  const left = Math.min(from.x, x) - (frame?.left ?? 0);
  const top = Math.min(from.y, y) - (frame?.top ?? 0);
  box.style.left = `${left}px`;
  box.style.top = `${top}px`;
  box.style.width = `${Math.abs(x - from.x)}px`;
  box.style.height = `${Math.abs(y - from.y)}px`;
}

const hideBand = (): void => { bandBox()?.remove(); };

/**
 * 囲んだ中にあるものの名札。**中心が入っていれば選ぶ** (端がかすっただけでは
 * 選ばない)。**配線も拾う** — 消すのは部品と配線の 2 つなのに、囲みで選べるのは
 * 部品だけだった (実機で「配線も複数選択に対応する」)。
 *
 * 配線は**見える線**で数える (掴む線は当たり判定を太らせてあり、中心も同じ所に
 * 出るが、図に出ていない線を拾わないほうが読みが揃う)。
 */
function inside(
  from: { readonly x: number; readonly y: number },
  x: number,
  y: number,
): { readonly parts: readonly string[]; readonly wires: readonly string[] } {
  const left = Math.min(from.x, x);
  const right = Math.max(from.x, x);
  const top = Math.min(from.y, y);
  const bottom = Math.max(from.y, y);

  const gather = (selector: string, name: string): readonly string[] => {
    const found: string[] = [];
    for (const shown of document.querySelectorAll(selector)) {
      const box = shown.getBoundingClientRect();
      const cx = box.left + box.width / 2;
      const cy = box.top + box.height / 2;
      const id = shown.getAttribute(name);
      if (id !== null && !found.includes(id) && cx >= left && cx <= right && cy >= top && cy <= bottom) {
        found.push(id);
      }
    }
    return found;
  };

  return { parts: gather('.cf-chip[data-part]', 'data-part'), wires: gather('.cf-wire[data-line]', 'data-line') };
}

/**
 * 狭い画面では属性と部品の一覧をしまってある (52 の docs/32)。
 * **図に重ねて出す**ので、図を触ったら引っ込める — 重なったまま触ると、
 * 引き出しの向こう側を押しているつもりで手前を押すことになる。
 */
const toggleDrawer = (): void => { document.body.classList.toggle('kc-drawer'); };
const closeDrawer = (): void => { document.body.classList.remove('kc-drawer'); };

document.addEventListener('pointerdown', (event) => {
  const target = elementOf(event);
  if (byFinger(event)) {
    fingers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    // **2 本目が来たら、1 本目の続きは取り消す。** なぞり始めてから足すことが
    // あるので、囲みかけ・持ち上げかけをその場で戻してから移動に移る。
    if (fingers.size >= 2) {
      dropLongPress();
      band = null;
      hideBand();
      run({ kind: 'cancel' });
      startPinch();
      return;
    }
    watchLongPress(event);
  }
  // 一覧の外を押したら閉じる (中は `click` が拾う)。
  if (target?.closest('.kc-menu') == null) closeMenu();
  // 引き出しの外を押したら引っ込める (ボタンそのものは `click` が受け持つ)。
  if (target?.closest('.kc-props, .kc-props-toggle') == null) closeDrawer();
  const onCanvas = target?.closest('.kc-canvas') != null && target?.closest('.kc-chooser') == null;
  // 中ボタン (か Space + 左) でパン。KiCad と同じ。
  if (onCanvas && (event.button === 1 || (event.button === 0 && spaceHeld))) {
    const box = canvas();
    panning = {
      x: event.clientX, y: event.clientY, left: box?.scrollLeft ?? 0, top: box?.scrollTop ?? 0,
    };
    event.preventDefault();
    return;
  }
  if (event.button !== 0) return;
  if (target?.closest(CHROME)) return;
  syncShift(event);
  const under = underAt(event.clientX, event.clientY);
  // **何も無い所から引いたら領域選択。** 掴むものがある所から始めたら今までどおり。
  if (onCanvas && state.tool === 'select' && state.carry === null
    && under.part === null && under.node === null && under.wire === null) {
    band = { x: event.clientX, y: event.clientY };
  }
  run({ kind: 'press', under, x: event.clientX, y: event.clientY, onMap: onCanvas, shift: event.shiftKey });
});

document.addEventListener('pointermove', (event) => {
  pointer = { x: event.clientX, y: event.clientY };
  syncShift(event);
  if (byFinger(event)) {
    if (fingers.has(event.pointerId)) fingers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    stirLongPress(event);
    // 2 本のあいだは状態遷移へ流さない (図を動かしているだけ)。
    if (fingers.size >= 2) {
      pinchTo();
      return;
    }
  }
  // **道具の列と右クリックの一覧の上ではカーソルの下を捨てない。** 捨てると
  // 「部品にカーソルを置いて回すボタンを押す」が効かなくなる (押した時点で
  // 対象が消えている)。一覧は押した所の右下に出るので、項目まで下りる途中で
  // 必ず部品から外れる — 実機で「右メニューが効かない」と言われたのはこれ。
  if (elementOf(event)?.closest('.kc-tools, .kc-menu') != null) return;
  if (panning !== null) {
    const box = canvas();
    if (box !== null) {
      box.scrollLeft = panning.left - (event.clientX - panning.x);
      box.scrollTop = panning.top - (event.clientY - panning.y);
    }
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
  if (byFinger(event)) {
    dropLongPress();
    const gestured = fingers.size >= 2;
    fingers.delete(event.pointerId);
    if (fingers.size < 2) pinch = null;
    // **なぞりの終わりは「押した」ではない。** 残った指も、押しの控えを
    // 持っていないので状態遷移は何もしない。
    if (gestured) return;
  }
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
      run({ kind: 'pickMany', ...inside(from, event.clientX, event.clientY) });
      return;
    }
  }
  const target = elementOf(event);
  if (target?.closest(CHROME) && state.pressed === null) return;
  syncShift(event);
  run({
    kind: 'release',
    under: underAt(event.clientX, event.clientY),
    x: event.clientX,
    y: event.clientY,
    shift: event.shiftKey,
  });
});

// 窓の外で放したときなど、放した知らせが来ないことがある。
/**
 * iOS のピンチ。**`touch-action` だけでは足りない** — Safari は独自の
 * `gesture*` でも送ってきて、断らないと頁ごと拡大される。そうなると図だけで
 * なく道具の列も帯も一緒に大きくなる (実機で「メニューアイコンは拡大対象に
 * しないで、固定表示して」)。
 *
 * 拡大そのものは 2 本指のなぞりでこちらがやる (52 の docs/32)。
 */
for (const kind of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(kind, (event) => { event.preventDefault(); }, { passive: false });
}

document.addEventListener('pointercancel', (event) => {
  if (byFinger(event)) {
    dropLongPress();
    fingers.delete(event.pointerId);
    if (fingers.size < 2) pinch = null;
  }
  panning = null;
  run({ kind: 'cancel' });
});

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
  // **刻みも折れ方も押している最中に切り替わる。** 升の下を読み直して塗り直す。
  syncShift(event);

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
  syncShift(event);
});

// **窓の外へ出たら Space を離したことにする。** 押したまま別のタブへ移ると
// `keyup` が届かず、戻ってきたあとの左クリックが全部「移動」になる。
window.addEventListener('blur', () => { spaceHeld = false; shiftHeld = false; panning = null; });
// **箱が広がったら図も広げ直す。** 幅は px で持っているので、パネルを広げても
// 100 % のままだと図が箱の中で右に余る。
window.addEventListener('resize', () => { applyView(); });
document.addEventListener('visibilitychange', () => {
  spaceHeld = false;
  shiftHeld = false;
  panning = null;
});

// ---------------------------------------------------------------- クリック (ボタン)

document.addEventListener('click', (event) => {
  const target = elementOf(event);

  // パレット。選ぶと持ち物になり、`Esc` まで続く。
  const chosen = target?.closest<HTMLElement>('.cf-pick');
  if (chosen?.dataset.type !== undefined) {
    pick(chosen);
    return;
  }

  // 配線の色見本。**引く色を決める** (配線を選んでいれば、その 1 本にも効く)。
  const swatch = target?.closest<HTMLElement>('.cf-swatch');
  if (swatch?.dataset.color !== undefined) {
    run({ kind: 'ink', color: swatch.dataset.color });
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
  if (target?.closest('.kc-dock-pop')) { openChooser(); return; }
  if (target?.closest('.kc-props-toggle')) { toggleDrawer(); return; }

  // フェンスの前後と両端。**一覧を開かずに隣へ行ける** (図を 1 枚ずつ見ていくとき)。
  const step = target?.closest<HTMLButtonElement>('.cf-fence-step');
  if (step) {
    const list = query<HTMLSelectElement>('.cf-fence');
    if (list !== null && list.options.length > 1) {
      const last = list.options.length - 1;
      const which = step.dataset.step;
      // **端では止まる。** 巻き戻ると、最後まで来たことが分からない。
      const at = which === 'first' ? 0
        : which === 'last' ? last
          : list.selectedIndex + (which === 'next' ? 1 : -1);
      const next = list.options[Math.min(last, Math.max(0, at))];
      if (next !== undefined && next.value !== list.value) {
        list.value = next.value;
        vscode.postMessage({ kind: 'fence', line: Number(next.value) });
      }
    }
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
  // **配線にも欄がある** (色)。何を選んでいるかを添えて、名札は拡張が組む —
  // 名前の無いものをどう指すかは文法の話で、殻の持ち物ではない。
  if (target.classList.contains('cf-field')) {
    const picked = state.selected;
    if (picked === null) return;
    const written = target.value.trim();
    // **節点も同じ道**。名前は `points:` の 1 行になるが、押した欄は同じ。
    vscode.postMessage(target.name === 'id'
      ? { kind: 'rename', what: picked.kind, part: picked.id, text: written }
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
  for (const element of document.querySelectorAll(selector)) mark(element, 'cf-aim');
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
  readonly can: readonly ('id' | 'type' | 'value' | 'label' | 'color')[];
  /** 種類の欄に出す候補。渡されたときだけ、その場で一覧を組み替える。 */
  readonly kinds?: readonly string[];
};

/**
 * 種類の欄が引く候補。**選ぶものが決まっているものだけ**その場で組み替える
 * (配線の `--` / `-|` / `|-`)。渡されなければ種類の一覧に戻す。
 */
function showKinds(kinds: readonly string[]): void {
  const input = fieldInput('type');
  const list = query('#cf-kind-names');
  if (input === null || list === null) return;
  list.textContent = '';
  for (const kind of kinds) {
    const option = document.createElement('option');
    option.value = kind;
    list.append(option);
  }
  input.setAttribute('list', kinds.length === 0 ? 'cf-type-names' : 'cf-kind-names');
}

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
  // **名前を直せるのは名前のあるものだけ。** 配線と注釈は行で指すので直せない
  // (種類は直せるが名前は無い、という組み合わせがあるので印を分けてある)。
  fill('id', part.id, part.can.includes('id'));
  fill('type', part.type, part.can.includes('type'));
  showKinds(part.kinds ?? []);
  // **書ける欄はフェンスが決める。** 殻は種類の語を知らない。
  fill('value', part.value, part.can.includes('value'));
  fill('label', part.label, part.can.includes('label'));
  fill('color', part.color, part.can.includes('color'));
}

type Incoming =
  | {
    readonly kind: 'map'; readonly html: string; readonly picker: string; readonly issues: string;
    /** いまのフェンスの語彙と能力表。**言語が変わると入れ替わる** (52 の docs/19, 23)。 */
    readonly chrome?: PanelChrome;
  }
  | { readonly kind: 'status'; readonly text: string }
  /**
   * 宿主からのお知らせ。**帯に赤で足す** — 頁が「ファイルを開けなかった」
   * ようなことを言う先 (52 の docs/46)。帯は次に図を組み直すまで残る。
   */
  | { readonly kind: 'notice'; readonly text: string; readonly bad?: boolean }
  | { readonly kind: 'aim'; readonly what?: string; readonly id?: string; readonly also?: readonly string[] }
  | { readonly kind: 'history'; readonly canUndo: boolean; readonly canRedo: boolean }
  | { readonly kind: 'fields'; readonly part: Fields | null }
  | {
    readonly kind: 'ghost'; readonly key: string; readonly cells: readonly string[];
    readonly ok: boolean; readonly why: string; readonly from?: readonly string[];
    readonly chip?: string;
    readonly shift?: Fine;
  };

/**
 * パレットの `details` は常に開いておく。**開け閉めの単位は箱のほう** —
 * 属性パネルに据え置きなら出しっぱなし、窓に移したなら窓の開け閉めが受け持つ。
 */
function openPaletteDetails(): void {
  for (const details of document.querySelectorAll<HTMLDetailsElement>('.cf-chrome-palette details')) {
    details.open = true;
  }
}

/**
 * 宿主のお知らせを帯へ足す。**読めなかった行と同じ見た目**にして、
 * 同じ所を見れば済むようにする (52 の docs/46)。
 *
 * **字は組まずに置く** (`textContent`) — 外から来た字なので、印を混ぜられても
 * 中身として出す。畳んであれば開く (出しても見えないと意味がない)。
 */
function showNotice(text: string, bad: boolean): void {
  const band = query('.cf-band');
  if (!band) return;
  const row = document.createElement('p');
  row.className = bad ? 'cf-issue cf-error' : 'cf-issue cf-notice';
  row.textContent = text;
  band.prepend(row);
  const box = band.closest('details');
  if (box instanceof HTMLDetailsElement) box.open = true;
}

const fill = (selector: string, html: string): void => {
  const target = query(selector);
  if (target) target.innerHTML = html;
};

/**
 * **語彙も能力表も入れ替える。** 1 つの殻が 3 つのフェンスを扱うので、言語をまたぐと
 * 置ける部品も種類の候補も、升の間を刻めるかどうかも変わる。ここで受けないと、最初に
 * 開いた言語のパレットが残る (52 の docs/19。畳んだあと実測で見つけた)。
 */
function applyChrome(chrome: PanelChrome): void {
  fill('.cf-chrome-palette', chrome.palette);
  fill('.cf-chrome-lists', chrome.typeNames + chrome.colorNames);
  // **色見本も語彙のうち。** 色を書かないフェンス (circuit) では空になる。
  fill('.cf-swatches', chrome.swatches);
  openPaletteDetails();
  // 能力表は状態にだけ流す (塗り直しは、このあとの hover の取り直しがやる)。
  // 箱の `data-` は起動の 1 回しか読まないので、書き直さない。
  state = step(state, { kind: 'chrome', foldsWire: chrome.foldsWire, fine: chrome.fine }).state;
}

window.addEventListener('message', (event: MessageEvent<Incoming>) => {
  const message = event.data;
  if (message.kind === 'map') {
    fill('.cf-body', message.html);
    fill('.cf-fences', message.picker);
    fill('.cf-band', message.issues);
    if (message.chrome !== undefined) applyChrome(message.chrome);
    // 中身を入れ替えたので、控えている印と絵は捨てる (指す先が図から外れた)。
    forgetPainted();
    applyView();
    // **選んでいたものが残っていれば選んだまま。** 書き換えのたびに組み直る
    // ので、そのたびに離すと欄で値を直せない。消えていれば捨てる。
    if (state.selected !== null && shownFor(state.selected) !== null) {
      // 光と欄も送り直してもらう (拡張側は何を選んでいるかを覚えていない)。
      gate.post({ kind: 'select', what: state.selected.kind, id: state.selected.id });
    } else {
      run({ kind: 'refresh' });
    }
    // 組み直した図の上で、カーソルの下を取り直す (持ち物のゴーストも訊き直す)。
    // **いったん空に戻す** — 同じ番地でも要素は入れ替わっているので、印を付け直す。
    run({ kind: 'hover', under: NOTHING });
    syncHover();
  }
  if (message.kind === 'ghost') {
    // **解錠する前に控えを取る。** 解錠すると待たせていた試し当てが飛び、
    // `asked` が次のものへ入れ替わる。
    const answering = asked;
    // **先に解錠する。** 待たせていた試し当てを送ってから塗り直すと、
    // 拡張が次の答えを作るあいだにこちらが塗れる。
    gate.answered(message.key);
    run({
      kind: 'ghost',
      ghost: {
        key: message.key, cells: message.cells, ok: message.ok, why: message.why,
        from: message.from, chip: message.chip, shift: message.shift,
      },
      ...(answering === null ? {} : { asked: answering }),
    });
  }
  if (message.kind === 'fields') showFields(message.part);
  if (message.kind === 'status') setText('.cf-status', message.text);
  if (message.kind === 'notice') showNotice(message.text, message.bad === true);
  if (message.kind === 'aim') {
    aim(message.what, message.id);
    // **カーソルが指した部品は選んだことにする。** 欄が出て、そのまま直せる。
    const what = message.what;
    const id = message.id;
    if ((what === 'part' || what === 'wire') && id !== undefined) {
      // **まとめて複製したときは全部を選ぶ** (続けて動かせるように)。
      const also: Picked[] = message.also?.map((one) => ({ kind: what, id: one })) ?? [];
      run({ kind: 'aim', picked: { kind: what, id }, also });
    }
  }
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

openPaletteDetails();

setText('.cf-status', step(state, { kind: 'hover', under: NOTHING }).status);
applyView();
