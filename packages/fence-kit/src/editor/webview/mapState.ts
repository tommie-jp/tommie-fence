/**
 * マップの webview の**状態遷移**。DOM も vscode も知らない純関数なので、
 * そのまま node のテストに掛かる。
 *
 * **型は KiCad から借りる** (52 の docs/17)。
 *
 * 1. **カーソルの下が対象。** 選んでいなければ、ホバーしている物に鍵が効く
 *    (`M` 動かす / `G` 引きずる / `R` 回す / `X` 反転 / `Del` 消す / `E` 欄)。
 * 2. **持ち上げて、置く所で 1 クリック。** 置く・動かす・引きずるは全部
 *    「持ち物 (`carry`) がカーソルに付いてくる → クリックで確定」。ドラッグでも
 *    同じ結果になる。**クリックだけでは動かない** (選んだあとの何気ないクリックが
 *    移動になると、置くつもりのない所へ飛ぶ)。
 * 3. **確定前に回せる。** 持ち物のまま `R` / `X` が効く。
 * 4. **`Esc` は段階的。** 持ち物を捨てる → 道具を「選ぶ」へ → 選択を外す。
 * 5. **続けて置く。** 置いたあと同じ種類がまたカーソルに付く。
 *
 * **ゴーストは拡張に訊く。** 持ち物があるとき、カーソルの下の穴が変わるたびに
 * `preview` を送り、拡張が「どの穴を使うか・置けるか」を `ghost` で返す。
 * 押したときと同じ関数を試し当てて答えるので、見せた物と書かれる物が
 * 食い違わない。穴の並べ方 (2 本足の間隔、3 本足の広がり) はこちらは知らない。
 */

export type Kind = 'part' | 'node' | 'wire';

/**
 * 選んでいるもの。**種類ごと覚える** (掴む物が違えば意味も違う)。
 * 部品の `id` は**名札** (`VCC#2`)。人に見せる字は `shown` を通す。
 */
export type Picked = { readonly kind: Kind; readonly id: string };

/**
 * 名札から、人に見せる名前を取る。番号は掴むためのもので、図には無い。
 * 節点は番地、配線は行番号なので `#` を持たない — どれを渡しても同じ手で済む。
 */
export const shownName = (handle: string): string => handle.split('#')[0] ?? handle;

/** 道具。**選ぶ**が既定で、`Esc` でいつでもここへ戻る。 */
export type Tool = 'select' | 'wire';

/**
 * カーソルの下にあるもの (DOM を読むのは `map.ts`)。**全部いっぺんに持つ** —
 * 部品の升にも節点は立つので、どれを対象にするかは鍵が決める
 * (`M` は部品、`G` は節点、`W` は穴)。
 */
export type Under = {
  readonly cell: string | null;
  readonly part: string | null;
  readonly node: string | null;
  readonly wire: string | null;
};

export const NOTHING: Under = { cell: null, part: null, node: null, wire: null };

/**
 * カーソルの下で鍵の対象になるもの。**部品 > 配線 > 節点**の順 — 部品の升にも
 * 節点は立つので、どれを掴んだつもりかは重なりの深いほうから決める。
 * `kinds` を渡すとその種類だけを見る (消すのは部品と配線だけ、など)。
 *
 * **押す・ホバーの印・消すの 3 か所が同じ順を使う。** 別々に持つと、
 * 光っているものと押して選ばれるものが食い違う。
 */
export function topOf(under: Under, kinds: readonly Kind[] = ['part', 'wire', 'node']): Picked | null {
  if (kinds.includes('part') && under.part !== null) return { kind: 'part', id: under.part };
  if (kinds.includes('wire') && under.wire !== null) return { kind: 'wire', id: under.wire };
  if (kinds.includes('node') && under.node !== null) return { kind: 'node', id: under.node };
  return null;
}

/** カーソルに付いているもの。 */
export type Carry =
  | {
    readonly kind: 'place';
    readonly type: string;
    /** 90 度を何回 (正が時計回り)。置く前に `R` で回した分。 */
    readonly turn: number;
    readonly flip: boolean;
    /** 2 端子か。ドラッグで間隔を選べるのはこれだけ (ほかは押した穴 1 つ)。 */
    readonly twoEnds: boolean;
  }
  | { readonly kind: 'move'; readonly part: string; readonly byPointer: boolean }
  | { readonly kind: 'drag'; readonly node: string; readonly byPointer: boolean };

/** 拡張が答えたゴースト。`key` は問い合わせの札 (古い答えを捨てる)。 */
export type Ghost = {
  readonly key: string;
  readonly cells: readonly string[];
  readonly ok: boolean;
  readonly why: string;
  /** ゴーストの絵が「いま」占めている穴。ここから行き先へずらす。 */
  readonly from?: readonly string[];
  /** 置く部品の絵 (置くときだけ)。図にまだ無い部品なので、拡張が切り出して寄こす。 */
  readonly chip?: string;
};

export type State = {
  readonly tool: Tool;
  readonly selected: Picked | null;
  readonly under: Under;
  readonly carry: Carry | null;
  /** 配線の 1 点目 (配線の道具)。2 点目のクリックで 1 本になる。 */
  readonly wireFrom: string | null;
  /** 押した場所。放した場所が離れていればドラッグ、その場ならクリック。 */
  readonly pressed: { readonly x: number; readonly y: number; readonly cell: string | null } | null;
  readonly ghost: Ghost | null;
  /** 直前に置いたもの (`Insert` でもう 1 つ)。足の数まで覚える。 */
  readonly lastPlaced: { readonly type: string; readonly twoEnds: boolean } | null;
  /** 戻す・やり直すを自分で持つか (パネル)。タブそのものがマップなら VS Code に任せる。 */
  readonly ownUndo: boolean;
  /** 配線を `Shift` で折れるか (フェンスの能力表)。案内文に出す。 */
  readonly foldsWire: boolean;
};

export const start = (ownUndo: boolean, foldsWire = false): State => ({
  tool: 'select',
  selected: null,
  under: NOTHING,
  carry: null,
  wireFrom: null,
  pressed: null,
  ghost: null,
  lastPlaced: null,
  ownUndo,
  foldsWire,
});

/** webview で起きたこと。**DOM を読むのは呼ぶ側** (`map.ts`)。 */
export type Event =
  | { readonly kind: 'hover'; readonly under: Under }
  | { readonly kind: 'press'; readonly under: Under; readonly x: number; readonly y: number; readonly onMap: boolean }
  /** 押したまま動いた。 */
  | { readonly kind: 'drag'; readonly under: Under; readonly x: number; readonly y: number }
  | { readonly kind: 'release'; readonly under: Under; readonly x: number; readonly y: number; readonly shift: boolean }
  | { readonly kind: 'cancel' }
  | {
    readonly kind: 'key';
    readonly key: string;
    readonly shift: boolean;
    /** Ctrl か Cmd (か Alt)。 */
    readonly modifier: boolean;
  }
  | { readonly kind: 'tool'; readonly tool: Tool }
  /** パレットで部品を選んだ。 */
  | { readonly kind: 'place'; readonly type: string; readonly twoEnds: boolean }
  /** 拡張がゴーストを返した。 */
  | { readonly kind: 'ghost'; readonly ghost: Ghost }
  /** マップを組み直した (要素が入れ替わるので押しかけを捨てる)。 */
  | { readonly kind: 'refresh' }
  | { readonly kind: 'dblclick'; readonly under: Under };

/** 拡張へ送る知らせ (`session.ts` の `Incoming` と同じ形)。 */
export type Message = { readonly kind: string } & Readonly<Record<string, unknown>>;

/** DOM 側に頼むフォーカスの移動。 */
export type Focus = 'search' | 'id';

export type Outcome = {
  readonly state: State;
  readonly send: readonly Message[];
  /** 帯に出す一言。 */
  readonly status: string;
  /** その打鍵をこちらで握ったか (既定の動きを止めるかどうか)。 */
  readonly handled: boolean;
  readonly focus: Focus | null;
};

/** 矢印 1 回ぶんの動き。**画面の向きそのまま** (下が行の増える向き)。 */
const ARROWS: Readonly<Record<string, { readonly rows: number; readonly cols: number }>> = {
  ArrowUp: { rows: -1, cols: 0 },
  ArrowDown: { rows: 1, cols: 0 },
  ArrowLeft: { rows: 0, cols: -1 },
  ArrowRight: { rows: 0, cols: 1 },
};

/** ドラッグと見なす距離。指で押すと数 px は動くので、0 では選べない。 */
const DRAG = 6;

const select = (picked: Picked | null): Message =>
  (picked === null ? { kind: 'select' } : { kind: 'select', what: picked.kind, id: picked.id });

/**
 * いまの状態でできること (KiCad の状態行)。**状態から毎回組む** — 決め打ちの
 * 案内文は、今の状態と関係ないことを言い続ける。
 */
export function hint(state: State): string {
  const { carry, under, selected } = state;
  if (carry !== null) {
    const bad = state.ghost !== null && !state.ghost.ok && state.ghost.why !== '' ? ` — ${state.ghost.why}` : '';
    if (carry.kind === 'place') {
      const how = carry.twoEnds ? 'クリックで置く (ドラッグで間隔を選ぶ)' : 'クリックで置く';
      return `${carry.type} を置きます: ${how} / R 回す / X 反転 / Esc でやめる${bad}`;
    }
    if (carry.kind === 'move') return `${shownName(carry.part)} を動かしています: 置きたい穴でクリック / Esc で戻す${bad}`;
    return `${carry.node} の節点を引きずっています: 置きたい穴でクリック (接続は保たれます) / Esc で戻す${bad}`;
  }
  if (state.tool === 'wire') {
    const fold = state.foldsWire ? ' (Shift で先に横へ折る)' : '';
    return state.wireFrom === null
      ? '配線: 始まりの穴をクリック / Esc でやめる'
      : `${state.wireFrom} から: 終わりの穴をクリック${fold} / Esc でやめる`;
  }
  if (under.part !== null) {
    return `${shownName(under.part)}: M 動かす / 矢印で 1 穴 / R 回す / X 反転 / Ctrl+D 複製 / E 属性 / Del 消す`;
  }
  if (under.wire !== null) return `${under.wire} 行目の配線: Del 消す`;
  if (under.node !== null) return `${under.node} の節点: G 引きずる (来ているものが丸ごと動く)`;
  if (selected !== null && selected.kind === 'part') {
    return `${shownName(selected.id)} を選んでいます: M 動かす / R 回す / X 反転 / E 属性 / Del 消す / Esc で外す`;
  }
  return 'A 部品を置く / W 配線 / M 動かす / G 引きずる (鍵はカーソルの下に効きます)';
}

const outcome = (
  state: State,
  send: readonly Message[] = [],
  status: string | null = null,
  handled = false,
  focus: Focus | null = null,
): Outcome => ({ state, send, status: status ?? hint(state), handled, focus });

/**
 * 間隔を選んでいる最中の 1 本目の足。2 端子を押したまま別の穴へ動かしている
 * ときだけ立つ。**ゴーストと確定に同じ値を渡す**ための 1 か所。
 */
function spanFrom(state: State, carry: Carry, cell: string | null): string | null {
  if (carry.kind !== 'place' || !carry.twoEnds) return null;
  const from = state.pressed?.cell ?? null;
  return from === null || from === cell ? null : from;
}

/** ゴーストの問い合わせの札。同じ札の答えだけを受け取る。 */
function previewKey(carry: Carry, cell: string, from: string | null): string {
  if (carry.kind === 'place') {
    return `place:${carry.type}:${from ?? ''}:${cell}:${carry.turn}:${carry.flip ? 1 : 0}`;
  }
  if (carry.kind === 'move') return `move:${carry.part}:${cell}`;
  return `node:${carry.node}:${cell}`;
}

/**
 * 持ち物をカーソルの下の穴に当ててみる問い合わせ。穴が無ければ何も訊かない。
 * **押したときと同じ穴を渡す** — ドラッグで間隔を選んでいる最中に押した穴を
 * 落とすと、緑に光った穴と書かれる穴が食い違う。
 */
function previewAt(state: State, carry: Carry, cell: string | null): readonly Message[] {
  if (cell === null) return [];
  const from = spanFrom(state, carry, cell);
  const key = previewKey(carry, cell, from);
  if (carry.kind === 'place') {
    return [{
      kind: 'preview',
      key,
      what: 'place',
      type: carry.type,
      to: cell,
      turn: carry.turn,
      flip: carry.flip,
      ...(from === null ? {} : { from }),
    }];
  }
  if (carry.kind === 'move') return [{ kind: 'preview', key, what: 'move', part: carry.part, to: cell }];
  return [{ kind: 'preview', key, what: 'node', from: carry.node, to: cell }];
}

/** 持ち物を持ち替える (ゴーストは訊き直す)。 */
const carrying = (state: State, carry: Carry | null, handled = false): Outcome => {
  const next: State = { ...state, carry, ghost: null, pressed: null };
  return outcome(next, carry === null ? [] : previewAt(next, carry, state.under.cell), null, handled);
};

function onHover(state: State, under: Under): Outcome {
  const moved = under.cell !== state.under.cell;
  const next: State = { ...state, under, ghost: moved && under.cell === null ? null : state.ghost };
  const ask = state.carry !== null && moved ? previewAt(next, state.carry, under.cell) : [];
  return outcome(next, ask);
}

/** 鍵の対象になる部品。選んでいればそれ、無ければカーソルの下。 */
const partTarget = (state: State): string | null =>
  (state.selected?.kind === 'part' ? state.selected.id : state.under.part);

function onPress(state: State, event: Extract<Event, { kind: 'press' }>): Outcome {
  const pressed = { x: event.x, y: event.y, cell: event.under.cell };
  const hovered: State = { ...state, under: event.under };

  // 持ち物があるあいだ、押すのは「ここに置く」の始まり (確定は放したとき)。
  if (state.carry !== null) return outcome({ ...hovered, pressed });

  if (state.tool === 'wire') {
    if (event.under.cell === null) return outcome(hovered);
    const from = state.wireFrom ?? event.under.cell;
    return outcome({ ...hovered, wireFrom: from, pressed });
  }

  const on = topOf(event.under);

  if (on === null) {
    // マップの何もない所を押したら選び直し (選んだままだと光が残る)。
    if (state.selected !== null && event.onMap) return outcome({ ...hovered, selected: null, pressed: null }, [select(null)]);
    return outcome(hovered);
  }
  return outcome({ ...hovered, selected: on, pressed }, [select(on)]);
}

function onDrag(state: State, event: Extract<Event, { kind: 'drag' }>): Outcome {
  // 持ち物があるままの引きずりは「間隔を選ぶ」。穴が変わるたびにゴーストを訊き直す
  // (押した穴も一緒に渡すので、光る穴と書かれる穴が揃う)。
  if (state.carry !== null) {
    const moved = event.under.cell !== state.under.cell;
    const next: State = { ...state, under: event.under };
    return outcome(next, moved ? previewAt(next, state.carry, event.under.cell) : []);
  }

  const hovered = onHover(state, event.under);
  const { pressed, selected } = hovered.state;
  if (pressed === null || selected === null) return hovered;
  if (Math.abs(event.x - pressed.x) + Math.abs(event.y - pressed.y) <= DRAG) return hovered;

  // 押したまま離れたら持ち上げる (KiCad の M / G をドラッグでも)。配線は動かせない。
  if (selected.kind === 'part') {
    const lifted = carrying(hovered.state, { kind: 'move', part: selected.id, byPointer: true });
    return { ...lifted, state: { ...lifted.state, pressed } };
  }
  if (selected.kind === 'node') {
    const lifted = carrying(hovered.state, { kind: 'drag', node: selected.id, byPointer: true });
    return { ...lifted, state: { ...lifted.state, pressed } };
  }
  return hovered;
}

function onRelease(state: State, event: Extract<Event, { kind: 'release' }>): Outcome {
  const hovered: State = { ...state, under: event.under };
  const cell = event.under.cell;
  const { carry, pressed } = state;
  const clear: State = { ...hovered, pressed: null };

  if (carry?.kind === 'place') {
    if (cell === null) return outcome(clear);
    const from = spanFrom(state, carry, cell);
    const traveled = from !== null && Math.abs(event.x - (pressed?.x ?? 0)) + Math.abs(event.y - (pressed?.y ?? 0)) > DRAG;
    // 2 端子はドラッグで間隔を選べる。ほかは押した穴 1 つ (並べ方は板が決める)。
    const at = traveled && from !== null ? [from, cell] : [cell];
    // **道具は置いたあとも続く** (何本も置くのが普通)。抜けるのは Esc。
    return outcome(
      { ...clear, lastPlaced: { type: carry.type, twoEnds: carry.twoEnds } },
      [{ kind: 'addPart', type: carry.type, at, turn: carry.turn, flip: carry.flip }],
      `${carry.type} を ${at.join(' ')} へ…`,
    );
  }

  if (carry?.kind === 'move' || carry?.kind === 'drag') {
    if (cell === null) {
      // ドラッグで持ち上げた物を穴の外で放したら戻す。鍵で持ち上げた物は持ったまま。
      return carry.byPointer ? carrying(clear, null) : outcome(clear);
    }
    if (carry.byPointer && pressed !== null && pressed.cell === cell) {
      // 持ち上げた穴に戻したのは「選んだ」だけ。
      return carrying(clear, null);
    }
    const done: State = { ...clear, carry: null, ghost: null };
    if (carry.kind === 'move') {
      return outcome(done, [{ kind: 'move', part: carry.part, to: cell }], `${shownName(carry.part)} を ${cell} へ…`);
    }
    return outcome(
      { ...done, selected: null },
      [{ kind: 'moveNode', from: carry.node, to: cell }],
      `${carry.node} の節点を ${cell} へ…`,
    );
  }

  if (state.tool === 'wire') {
    const from = state.wireFrom;
    if (from === null || cell === null || cell === from) return outcome(clear);
    const operator = event.shift && state.foldsWire ? '-|' : '--';
    return outcome(
      { ...clear, wireFrom: null },
      [{ kind: 'addWire', from, to: cell, operator }],
      `${from} から ${cell} へ…`,
    );
  }

  return outcome(clear);
}

/** 道具の鍵。 */
function onKey(state: State, event: Extract<Event, { kind: 'key' }>): Outcome {
  if (event.key === 'Escape') {
    if (state.carry !== null) return carrying(state, null, true);
    // 配線の引きかけは、道具を抜ける前に 1 点目だけを捨てる。
    if (state.wireFrom !== null) return outcome({ ...state, wireFrom: null, pressed: null }, [], null, true);
    if (state.tool !== 'select') return { ...step(state, { kind: 'tool', tool: 'select' }), handled: true };
    if (state.selected === null) return outcome(state);
    return outcome({ ...state, selected: null, pressed: null }, [select(null)], null, true);
  }

  if (event.modifier) {
    // 複製は掴んだ物に効く。**タブでもパネルでも同じ** (undo と違って VS Code と
    // 取り合わない鍵なので、`ownUndo` を見ない)。
    if (event.key.toLowerCase() === 'd') {
      const part = partTarget(state);
      if (part === null) return outcome(state);
      return outcome(state, [{ kind: 'duplicate', part }], `${shownName(part)} をもう 1 つ…`, true);
    }
    // **パネルにフォーカスがあると VS Code の Ctrl+Z は届かない。** ここで受けて、
    // 拡張側が覚えている履歴を巻き戻す。タブそのものがマップのときは横取りせず通す。
    if (!state.ownUndo) return outcome(state);
    const key = event.key.toLowerCase();
    if (key === 'z' && !event.shift) return outcome(state, [{ kind: 'undo' }], null, true);
    if ((key === 'z' && event.shift) || key === 'y') return outcome(state, [{ kind: 'redo' }], null, true);
    return outcome(state);
  }

  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;

  if (key === 'a') return outcome(state, [], null, true, 'search');
  if (key === 'w') return { ...step(state, { kind: 'tool', tool: 'wire' }), handled: true };

  // 持ち物のまま回す・反転する (置く前に向きを決める)。
  if (state.carry?.kind === 'place') {
    if (key === 'r') {
      const turn = state.carry.turn + (event.shift ? -1 : 1);
      return carrying(state, { ...state.carry, turn }, true);
    }
    if (key === 'x') return carrying(state, { ...state.carry, flip: !state.carry.flip }, true);
    return outcome(state);
  }
  // 持ち上げた部品も回せる。**書き換えは本文へ当たる** (持ち物は行き先だけなので)
  // ので、ゴーストを訊き直して新しい形を見せる。
  if (state.carry?.kind === 'move') {
    const { part } = state.carry;
    if (key === 'r') {
      const quarters = event.shift ? -1 : 1;
      return outcome(state, [{ kind: 'turn', part, quarters }], `${shownName(part)} を回しています…`, true);
    }
    if (key === 'x') return outcome(state, [{ kind: 'flip', part }], `${shownName(part)} を反転しています…`, true);
  }
  if (state.carry !== null) return outcome(state);

  if (key === 'Insert') {
    const again = state.lastPlaced;
    if (again === null) return outcome(state);
    // **足の数まで覚える。** 種類だけ覚えると、2 端子なのにドラッグで間隔を選べなくなる。
    return { ...step(state, { kind: 'place', ...again }), handled: true };
  }

  if (key === 'g') {
    // 選んでいればそちら (ほかの鍵と同じ順)。
    const node = state.selected?.kind === 'node' ? state.selected.id : state.under.node;
    if (node === null) return outcome(state);
    return carrying(state, { kind: 'drag', node, byPointer: false }, true);
  }

  if (key === 'Delete' || key === 'Backspace') {
    // 節点は交点であって物ではないので、消すものが無い。
    const picked = state.selected !== null && state.selected.kind !== 'node'
      ? state.selected
      : topOf(state.under, ['part', 'wire']);
    if (picked === null) return outcome(state);
    return outcome(
      { ...state, selected: null, pressed: null },
      [{ kind: 'delete', what: picked.kind, id: picked.id }],
      `${shownName(picked.id)} を消しています…`,
      true,
    );
  }

  const part = partTarget(state);
  if (part === null) return outcome(state);
  const picked: Picked = { kind: 'part', id: part };

  // 矢印で 1 穴。**行き先を数えるのは拡張** (綴りを知らない)。
  const arrow = ARROWS[key];
  if (arrow !== undefined) {
    return outcome(
      { ...state, selected: picked },
      [{ kind: 'nudge', part, rows: arrow.rows, cols: arrow.cols }],
      `${shownName(part)} を動かしています…`,
      true,
    );
  }

  if (key === 'm') return carrying({ ...state, selected: picked }, { kind: 'move', part, byPointer: false }, true);
  if (key === 'r') {
    const quarters = event.shift ? -1 : 1;
    return outcome(state, [{ kind: 'turn', part, quarters }], `${shownName(part)} を回しています…`, true);
  }
  if (key === 'x') return outcome(state, [{ kind: 'flip', part }], `${shownName(part)} を反転しています…`, true);
  if (key === 'e' || key === 'F2') {
    return outcome({ ...state, selected: picked }, [select(picked)], null, true, 'id');
  }
  return outcome(state);
}

/** 拡張のゴースト。**いま訊いているものの答えだけ**を受け取る (古い答えは捨てる)。 */
function onGhost(state: State, ghost: Ghost): Outcome {
  const { carry, under } = state;
  const wanted = carry === null || under.cell === null
    ? null
    : previewKey(carry, under.cell, spanFrom(state, carry, under.cell));
  if (wanted !== ghost.key) return outcome(state);
  return outcome({ ...state, ghost });
}

export function step(state: State, event: Event): Outcome {
  switch (event.kind) {
    case 'hover':
      return onHover(state, event.under);
    case 'press':
      return onPress(state, event);
    case 'drag':
      return onDrag(state, event);
    case 'release':
      return onRelease(state, event);
    case 'cancel':
      // 窓の外で放したときなど、放した知らせが来ないことがある。
      return state.carry !== null && state.carry.kind !== 'place' && state.carry.byPointer
        ? carrying({ ...state, pressed: null }, null)
        : outcome({ ...state, pressed: null });
    case 'key':
      return onKey(state, event);
    case 'tool':
      return outcome(
        { ...state, tool: event.tool, carry: null, ghost: null, wireFrom: null, pressed: null, selected: null },
        [select(null)],
      );
    case 'place': {
      const carry: Carry = { kind: 'place', type: event.type, turn: 0, flip: false, twoEnds: event.twoEnds };
      const lifted = carrying({ ...state, tool: 'select', selected: null, wireFrom: null }, carry);
      return { ...lifted, send: [select(null), ...lifted.send] };
    }
    case 'ghost':
      return onGhost(state, event.ghost);
    case 'refresh':
      // **持ち物は続ける** (組み直しは書き換えのたびに起きる)。押しかけは捨てる。
      return outcome({ ...state, selected: null, pressed: null });
    case 'dblclick': {
      if (event.under.part === null) return outcome(state);
      const picked: Picked = { kind: 'part', id: event.under.part };
      return outcome({ ...state, under: event.under, selected: picked }, [select(picked)], null, true, 'id');
    }
    default:
      return outcome(state);
  }
}
