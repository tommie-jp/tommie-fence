/**
 * マップの webview の**状態遷移**。DOM も vscode も知らない純関数なので、
 * そのまま node のテストに掛かる (設計上の約束 1 と同じ考え方を webview にも)。
 *
 * 掴む物は 3 つ — 部品のチップ、節点の点、配線の線。**同じ操作に混ぜない**ので
 * 持ち方を切り替えさせる (部品は 1 つだけ動いて接続が変わり、節点は交点ごと
 * 動いて接続が保たれる。掴む物が違えば意味も違う、で曖昧さが消える)。
 * 配線は動かせないが、消すには選ぶ手立てが要るので部品と同じ持ち方で選べる。
 *
 * **動かすのはドラッグだけ。** 選んでから別の場所をクリックする 2 段構えは
 * 廃止した (選んだあとの何気ないクリックがそのまま移動になり、置くつもりの
 * ない所へ飛ぶ)。クリックは選ぶだけで、エディタ側が光る。
 */

export type Kind = 'part' | 'node' | 'wire';

/** 選んでいるもの。**種類ごと覚える** (掴む物が違えば意味も違う)。 */
export type Picked = { readonly kind: Kind; readonly id: string };

/** 掴む物の持ち方。 */
export type Mode = 'part' | 'node';

export type State = {
  readonly mode: Mode;
  readonly picked: Picked | null;
  /** 押した場所。放した場所が離れていればドラッグ、その場なら選んだだけ。 */
  readonly pressed: { readonly x: number; readonly y: number } | null;
  /**
   * 戻す・やり直すを自分で持つか。パネルは持つ (フォーカスがあると VS Code の
   * `Ctrl+Z` がエディタに届かない)。タブそのものがマップのときは VS Code に任せる。
   */
  readonly ownUndo: boolean;
};

export const start = (ownUndo: boolean): State =>
  ({ mode: 'part', picked: null, pressed: null, ownUndo });

/** webview で起きたこと。**DOM を読むのは呼ぶ側** (`map.ts`)。 */
export type Event =
  | {
    readonly kind: 'press';
    /** 押した先にあった掴める物 (無ければ null)。 */
    readonly on: Picked | null;
    readonly x: number;
    readonly y: number;
    /** マップの上を押したか (外を押しても選択は消さない)。 */
    readonly onMap: boolean;
  }
  | { readonly kind: 'release'; readonly x: number; readonly y: number; readonly cell: string | null }
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
  | { readonly kind: 'mode'; readonly mode: Mode }
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
  outcome({ ...state, picked: null, pressed: null }, [select(null)], '', true);

function onPress(state: State, event: Extract<Event, { kind: 'press' }>): Outcome {
  // いまの持ち方に合う物だけを掴む。部品の升にも節点は立つので、どちらも
  // 掴めると掴んだつもりと違うものが動く。
  const wanted = state.mode === 'node' ? ['node'] : ['part', 'wire'];
  const on = event.on !== null && wanted.includes(event.on.kind) ? event.on : null;

  if (on === null) {
    // マップの何もない所を押したら選び直し (選んだままだと光が残る)。
    return state.picked !== null && event.onMap ? letGo(state) : outcome(state);
  }
  return outcome(
    { ...state, picked: on, pressed: { x: event.x, y: event.y } },
    [select(on)],
    `${on.id}${HINTS[on.kind]}`,
  );
}

function onRelease(state: State, event: Extract<Event, { kind: 'release' }>): Outcome {
  const { picked, pressed } = state;
  if (picked === null || pressed === null) return outcome({ ...state, pressed: null });

  // **その場で放したのは「選んだ」だけ。** 配線は動かせない (端の付け替えは別の話)。
  const moved = picked.kind !== 'wire'
    && Math.abs(event.x - pressed.x) + Math.abs(event.y - pressed.y) > DRAG;
  if (!moved || event.cell === null) return outcome({ ...state, pressed: null });

  const what = picked.kind === 'node' ? `${picked.id} の節点` : picked.id;
  return outcome(
    { ...state, picked: null, pressed: null },
    [picked.kind === 'node'
      ? { kind: 'moveNode', from: picked.id, to: event.cell }
      : { kind: 'move', part: picked.id, to: event.cell }],
    `${what} を ${event.cell} へ…`,
  );
}

function onKey(state: State, event: Extract<Event, { kind: 'key' }>): Outcome {
  if (event.key === 'Escape') return state.picked === null ? outcome(state) : letGo(state);

  if (event.modifier) {
    // **パネルにフォーカスがあると VS Code の Ctrl+Z は届かない。** ここで受けて、
    // 拡張側が覚えている履歴を巻き戻す。タブそのものがマップのときは横取りせず通す。
    if (!state.ownUndo) return outcome(state);
    const key = event.key.toLowerCase();
    if (key === 'z' && !event.shift) return outcome(state, [{ kind: 'undo' }], null, true);
    if ((key === 'z' && event.shift) || key === 'y') return outcome(state, [{ kind: 'redo' }], null, true);
    return outcome(state);
  }

  const { picked } = state;
  if (picked === null || event.typing) return outcome(state);

  if (event.key === 'Delete' || event.key === 'Backspace') {
    // 節点は交点であって物ではないので、消すものが無い。
    if (picked.kind === 'node') return outcome(state);
    return outcome(
      { ...state, picked: null, pressed: null },
      [{ kind: 'delete', what: picked.kind, id: picked.id }],
      `${picked.id} を消しています…`,
      true,
    );
  }

  // 回す・反転するのは部品だけ。**掴んだまま**にして、続けて回せるようにする。
  if (picked.kind !== 'part') return outcome(state);
  const key = event.key.toLowerCase();
  if (key === 'r') {
    const quarters = event.shift ? -1 : 1;
    return outcome(state, [{ kind: 'turn', part: picked.id, quarters }], `${picked.id} を回しています…`, true);
  }
  if (key === 'm') {
    return outcome(state, [{ kind: 'flip', part: picked.id }], `${picked.id} を反転しています…`, true);
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
      return outcome({ ...state, pressed: null });
    case 'key':
      return onKey(state, event);
    case 'mode':
      return outcome({ ...state, mode: event.mode, picked: null, pressed: null }, [select(null)], '');
    case 'refresh':
      return outcome({ ...state, picked: null, pressed: null });
    default:
      return outcome(state);
  }
}
