/**
 * マップの webview の**状態遷移**。DOM も vscode も知らない純関数なので、
 * そのまま node のテストに掛かる (設計上の約束 1 と同じ考え方を webview にも)。
 *
 * 道具は 3 つ — **選ぶ・配線・節点**。掴む物が違えば意味も違うので、同じ操作に
 * 混ぜない (部品は 1 つだけ動いて接続が変わり、節点は交点ごと動いて接続が
 * 保たれる)。配線は動かせないが、消すには選ぶ手立てが要るので「選ぶ」道具で
 * 部品と一緒に選べる。
 *
 * **動かすのはドラッグだけ。** 選んでから別の場所をクリックする 2 段構えは
 * 廃止した (選んだあとの何気ないクリックがそのまま移動になり、置くつもりの
 * ない所へ飛ぶ)。クリックは選ぶだけで、エディタ側が光る。
 */

export type Kind = 'part' | 'node' | 'wire';

/**
 * 選んでいるもの。**種類ごと覚える** (掴む物が違えば意味も違う)。
 *
 * 部品の `id` は**名札** (`core/edit/handles.ts`) — 同じ名前の記号が 2 つ以上
 * あることがあるので、掴んだものは名前ではなく名札で指す。人に見せる字は
 * `shown` を通す (「VCC#2 を消しています」ではなく「VCC を消しています」)。
 */
export type Picked = { readonly kind: Kind; readonly id: string };

/** 名札から、人に見せる名前を取る。番号は掴むためのもので、図には無い。 */
const shown = (picked: Picked): string =>
  picked.kind === 'part' ? picked.id.split('#')[0] ?? picked.id : picked.id;

/** 道具。**選ぶ**が既定で、`Esc` でいつでもここへ戻る。 */
export type Tool = 'select' | 'wire' | 'node' | 'part';

/** パレットで選んだ、これから置く部品。 */
export type Placing = {
  readonly type: string;
  /** 2 端子か (交点から交点へドラッグする。1 端子・多端子は 1 回の押しで置く)。 */
  readonly twoEnds: boolean;
};

export type State = {
  readonly tool: Tool;
  readonly picked: Picked | null;
  /** 押した場所。放した場所が離れていればドラッグ、その場なら選んだだけ。 */
  readonly pressed: { readonly x: number; readonly y: number } | null;
  /** 配線の道具で押した交点 (引きかけの端)。放した交点との間に 1 本引く。 */
  readonly drawing: string | null;
  /** パレットで選んだ部品。**`Esc` まで置き続ける** (何本も置くのが普通なので)。 */
  readonly placing: Placing | null;
  /**
   * 戻す・やり直すを自分で持つか。パネルは持つ (フォーカスがあると VS Code の
   * `Ctrl+Z` がエディタに届かない)。タブそのものがマップのときは VS Code に任せる。
   */
  readonly ownUndo: boolean;
};

export const start = (ownUndo: boolean): State =>
  ({ tool: 'select', picked: null, pressed: null, drawing: null, placing: null, ownUndo });

/** webview で起きたこと。**DOM を読むのは呼ぶ側** (`map.ts`)。 */
export type Event =
  | {
    readonly kind: 'press';
    /** 押した先にあった掴める物 (無ければ null)。 */
    readonly on: Picked | null;
    /** 押した先の交点 (配線の道具が使う)。 */
    readonly cell: string | null;
    readonly x: number;
    readonly y: number;
    /** マップの上を押したか (外を押しても選択は消さない)。 */
    readonly onMap: boolean;
  }
  | {
    readonly kind: 'release';
    readonly x: number;
    readonly y: number;
    readonly cell: string | null;
    /** 押しながら放したか (配線の折れ方を変える)。 */
    readonly shift: boolean;
  }
  | { readonly kind: 'cancel' }
  | {
    readonly kind: 'key';
    readonly key: string;
    readonly shift: boolean;
    /** Ctrl か Cmd (か Alt)。 */
    readonly modifier: boolean;
    /** 欄に字を打っている最中か (打鍵を横取りしない)。 */
    readonly typing: boolean;
  }
  | { readonly kind: 'tool'; readonly tool: Tool }
  /** パレットで部品を選んだ。 */
  | { readonly kind: 'place'; readonly placing: Placing }
  /** マップを組み直した (要素が入れ替わるので掴みを捨てる)。 */
  | { readonly kind: 'refresh' };

/** 拡張へ送る知らせ (`session.ts` の `Incoming` と同じ形)。 */
export type Message = { readonly kind: string } & Readonly<Record<string, unknown>>;

export type Outcome = {
  readonly state: State;
  readonly send: readonly Message[];
  /** 帯に出す一言。**null は「変えない」**、空文字は消す。 */
  readonly status: string | null;
  /** その打鍵をこちらで握ったか (既定の動きを止めるかどうか)。 */
  readonly handled: boolean;
};

/** ドラッグと見なす距離。指で押すと数 px は動くので、0 では選べない。 */
const DRAG = 6;

const HINTS: Readonly<Record<Kind, string>> = {
  part: ' を選びました。ドラッグで動かし、R で回し、M で反転、Delete で消します',
  node: ' の節点を選びました。ドラッグして置きたい交点で放します',
  wire: ' 行目の配線を選びました。Delete で消します',
};

/** 選んだものをエディタで光らせてもらう (拡張だけが文書を触れる)。 */
const select = (picked: Picked | null): Message =>
  (picked === null ? { kind: 'select' } : { kind: 'select', what: picked.kind, id: picked.id });

const outcome = (
  state: State,
  send: readonly Message[] = [],
  status: string | null = null,
  handled = false,
): Outcome => ({ state, send, status, handled });

const letGo = (state: State): Outcome =>
  outcome({ ...state, picked: null, pressed: null, drawing: null }, [select(null)], '', true);

function onPress(state: State, event: Extract<Event, { kind: 'press' }>): Outcome {
  if (state.tool === 'part') {
    // 2 端子は交点から交点へ。1 端子・多端子は放した交点に置くので、
    // 押した時点では何も覚えない。
    if (event.cell === null || !state.placing?.twoEnds) return outcome(state);
    return outcome(
      { ...state, drawing: event.cell, pressed: { x: event.x, y: event.y } },
      [],
      `${event.cell} から。放した交点までが ${state.placing.type} になります`,
    );
  }

  if (state.tool === 'wire') {
    // 配線は**交点から交点へ**。押した交点を覚え、放した交点との間に 1 本引く。
    if (event.cell === null) return outcome(state);
    return outcome(
      { ...state, drawing: event.cell, pressed: { x: event.x, y: event.y } },
      [],
      `${event.cell} から。放した交点まで引きます (Shift で先に横へ折る)`,
    );
  }

  // いまの道具で掴める物だけを掴む。部品の升にも節点は立つので、どちらも
  // 掴めると掴んだつもりと違うものが動く。
  const wanted = state.tool === 'node' ? ['node'] : ['part', 'wire'];
  const on = event.on !== null && wanted.includes(event.on.kind) ? event.on : null;

  if (on === null) {
    // マップの何もない所を押したら選び直し (選んだままだと光が残る)。
    return state.picked !== null && event.onMap ? letGo(state) : outcome(state);
  }
  return outcome(
    { ...state, picked: on, pressed: { x: event.x, y: event.y } },
    [select(on)],
    `${shown(on)}${HINTS[on.kind]}`,
  );
}

function onRelease(state: State, event: Extract<Event, { kind: 'release' }>): Outcome {
  if (state.tool === 'part' && state.placing !== null) {
    const { type, twoEnds } = state.placing;
    const from = state.drawing;
    const clear = { ...state, drawing: null, pressed: null };
    if (event.cell === null) return outcome(clear, [], '');
    // **道具は置いたあとも続く** (何本も置くのが普通)。抜けるのは Esc。
    if (!twoEnds) return outcome(clear, [{ kind: 'addPart', type, at: [event.cell] }], `${type} を ${event.cell} へ…`);
    if (from === null || from === event.cell) return outcome(clear, [], '');
    return outcome(
      clear,
      [{ kind: 'addPart', type, at: [from, event.cell] }],
      `${type} を ${from} から ${event.cell} へ…`,
    );
  }

  if (state.drawing !== null) {
    const from = state.drawing;
    const clear = { ...state, drawing: null, pressed: null };
    // 同じ交点で放したのは引きかけの取り消し (長さ 0 の線は図に出ない)。
    if (event.cell === null || event.cell === from) return outcome(clear, [], '');
    return outcome(
      clear,
      [{ kind: 'addWire', from, to: event.cell, operator: event.shift ? '-|' : '--' }],
      `${from} から ${event.cell} へ…`,
    );
  }

  const { picked, pressed } = state;
  if (picked === null || pressed === null) return outcome({ ...state, pressed: null });

  // **その場で放したのは「選んだ」だけ。** 配線は動かせない (端の付け替えは別の話)。
  const moved = picked.kind !== 'wire'
    && Math.abs(event.x - pressed.x) + Math.abs(event.y - pressed.y) > DRAG;
  if (!moved || event.cell === null) return outcome({ ...state, pressed: null });

  const what = picked.kind === 'node' ? `${picked.id} の節点` : shown(picked);
  return outcome(
    { ...state, picked: null, pressed: null },
    [picked.kind === 'node'
      ? { kind: 'moveNode', from: picked.id, to: event.cell }
      : { kind: 'move', part: picked.id, to: event.cell }],
    `${what} を ${event.cell} へ…`,
  );
}

/** 道具の鍵 (KiCad の語彙に寄せる)。 */
const TOOL_KEYS: Readonly<Record<string, Tool>> = { v: 'select', w: 'wire', n: 'node' };

function onKey(state: State, event: Extract<Event, { kind: 'key' }>): Outcome {
  if (event.key === 'Escape') {
    // **`Esc` は「選ぶ」へ戻る鍵**でもある (道具に入ったまま抜けられないと詰む)。
    if (state.tool !== 'select') return step(state, { kind: 'tool', tool: 'select' });
    return state.picked === null ? outcome(state) : letGo(state);
  }

  if (event.modifier) {
    // **パネルにフォーカスがあると VS Code の Ctrl+Z は届かない。** ここで受けて、
    // 拡張側が覚えている履歴を巻き戻す。タブそのものがマップのときは横取りせず通す。
    if (!state.ownUndo) return outcome(state);
    const key = event.key.toLowerCase();
    if (key === 'z' && !event.shift) return outcome(state, [{ kind: 'undo' }], null, true);
    if ((key === 'z' && event.shift) || key === 'y') return outcome(state, [{ kind: 'redo' }], null, true);
    return outcome(state);
  }

  if (event.typing) return outcome(state);

  // 道具は掴んでいなくても選べる (これから何をするかの話なので)。
  const tool = TOOL_KEYS[event.key.toLowerCase()];
  if (tool !== undefined) return { ...step(state, { kind: 'tool', tool }), handled: true };

  const { picked } = state;
  if (picked === null) return outcome(state);

  if (event.key === 'Delete' || event.key === 'Backspace') {
    // 節点は交点であって物ではないので、消すものが無い。
    if (picked.kind === 'node') return outcome(state);
    return outcome(
      { ...state, picked: null, pressed: null },
      [{ kind: 'delete', what: picked.kind, id: picked.id }],
      `${shown(picked)} を消しています…`,
      true,
    );
  }

  // 回す・反転するのは部品だけ。**掴んだまま**にして、続けて回せるようにする。
  if (picked.kind !== 'part') return outcome(state);
  const key = event.key.toLowerCase();
  if (key === 'r') {
    const quarters = event.shift ? -1 : 1;
    return outcome(
      state,
      [{ kind: 'turn', part: picked.id, quarters }],
      `${shown(picked)} を回しています…`,
      true,
    );
  }
  if (key === 'm') {
    return outcome(state, [{ kind: 'flip', part: picked.id }], `${shown(picked)} を反転しています…`, true);
  }
  return outcome(state);
}

export function step(state: State, event: Event): Outcome {
  switch (event.kind) {
    case 'press':
      return onPress(state, event);
    case 'release':
      return onRelease(state, event);
    case 'cancel':
      // 窓の外で放したときなど、放した知らせが来ないことがある。
      return outcome({ ...state, pressed: null, drawing: null });
    case 'key':
      return onKey(state, event);
    case 'tool':
      return outcome(
        { ...state, tool: event.tool, picked: null, pressed: null, drawing: null, placing: null },
        [select(null)],
        '',
      );
    case 'place':
      return outcome(
        { ...state, tool: 'part', placing: event.placing, picked: null, pressed: null, drawing: null },
        [select(null)],
        `${event.placing.type} を置きます。${event.placing.twoEnds ? '交点から交点へドラッグ' : '置きたい交点をクリック'} (Esc でやめる)`,
      );
    case 'refresh':
      // **置く道具は続ける** (組み直しは書き換えのたびに起きる)。
      return outcome({ ...state, picked: null, pressed: null, drawing: null });
    default:
      return outcome(state);
  }
}
