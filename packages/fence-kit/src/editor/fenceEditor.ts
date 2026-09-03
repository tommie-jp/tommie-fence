import type { FenceBlock } from '../fences.ts';
import type { Edit, LineEdit, NetDiff, Span } from './edits.ts';

/**
 * **殻がフェンスに求めるもの。** マップのセッション (`session.ts`) と webview は
 * これしか知らないので、フェンスの文法を知らずに動く。
 *
 * 3 つのフェンス (circuit / breadboard / perfboard) で同じ殻を使うための境目。
 * 実装は各パッケージが 1 つ持つ (circuit は `circuitEditor.ts`)。
 *
 * **やり取りは文字列。** 番地は**書かれた綴りのまま**渡し、読めるかどうかは
 * 実装が見て `EditResult` の断りで返す。殻に番地の型を持ち込むと、
 * フェンスごとに違う綴り (`a1` / `+t5` / `aa12`) が殻へ漏れる。
 *
 * 型のうち `Edit` / `LineEdit` / `NetDiff` / `Span` は**綴りに依らない**ので
 * 隣の `edits.ts` にある (行と桁の数え方は 3 つのフェンスで同じ)。
 */

/** 文書の中のフェンス 1 つ (一覧に出す札)。 */
export type FenceEntry = {
  /** 開き記号の行 (1 始まり)。 */
  readonly line: number;
  /** 題。無ければ null。 */
  readonly title: string | null;
};

/** マップの中身。**組み上がった HTML** で受け取る (殻は中身を知らない)。 */
export type FenceView = {
  /** 升目 (エスケープ済み)。 */
  readonly map: string;
  /** 読めなかったところとお知らせの帯。無ければ空。 */
  readonly issues: string;
};

/** エディタのカーソルが指しているもの。**`id` は文字列** (番地なら綴り、配線なら行)。 */
export type Aim = {
  readonly kind: 'part' | 'node' | 'wire';
  readonly id: string;
};

/** 欄の名前。3 つとも「1 部品 = 1 行」の行の中の綴りに落ちる。 */
export type PartField = 'type' | 'value' | 'label';

/** 選んだ部品の欄。**中身は素通し** — 殻は webview へ渡すだけで、意味を見ない。 */
export type PartFields = {
  readonly id: string;
  readonly type: string;
  readonly value: string;
  readonly label: string;
  /**
   * **書ける欄をフェンスが決める。** 種類ごとにどの欄があるかは文法の語彙の
   * 話で、殻の持ち物ではない (`kind` を渡して殻が判じる形にしていたら、
   * circuit の語 (`one-terminal`) が他のフェンスにも要ることになっていた)。
   *
   * ここに載っていても**書き換えが断られることはある** — 値と `v=` のように、
   * 同じ行の別の綴りとの兼ね合いで決まるものがあるため。理由は書き換えの
   * 答え (`EditResult`) が返す。
   */
  readonly can: readonly PartField[];
};

/**
 * 置く部品。番地は**書かれた綴り**で渡す。
 *
 * **番地が 1 つなら、残りはフェンスが決める** (2 本足は既定の間隔で右へ、
 * 3 本足は右へ 2 穴、アンカー 1 つの形はそのまま)。マップは押した穴を
 * 1 つ送るだけでよく、穴の並べ方は板を知っている側が持つ。
 * `turn` / `flip` は**置く前に**回す・反転する (ゴーストの向きのまま書く)。
 */
export type NewPart = {
  readonly id: string;
  readonly type: string;
  readonly at: readonly string[];
  /** 90 度を何回 (正が時計回り)。無ければ 0。 */
  readonly turn?: number;
  readonly flip?: boolean;
} & Trial;

/**
 * **試し当て**の印。ゴーストは「どの穴を使うか」だけを見て捨てるので、
 * 接続の変化 (`diff`) を数えない — 数えるには図を 2 枚組み直すことになり、
 * 穴をまたぐたびに払うと拡張ホストが詰まる (置く・動かすの 5.3ms のうち 5.3ms)。
 *
 * 書き換えそのものは同じ関数を通る (見せた物と書かれる物を食い違わせない)。
 */
export type Trial = {
  readonly preview?: boolean;
};

/** 1 回の書き換え。行の中の差し替えと、行の出し入れの両方を持てる。 */
export type EditChanges = {
  readonly edits?: readonly Edit[];
  readonly lines?: readonly LineEdit[];
  readonly diff: NetDiff;
  /** 部品と一緒に消えた配線の本数 (消すときだけ)。 */
  readonly wires?: number;
};

/** 書き換えの答え。断りは**行番号つき**で返す (帯にそのまま出せる)。 */
export type EditResult =
  | { readonly ok: true; readonly value: EditChanges }
  | { readonly ok: false; readonly error: { readonly message: string; readonly line: number | null } };

export type FenceEditor = {
  /** フェンスの言葉 (` ```circuit ` の `circuit`)。お知らせの文面に出す。 */
  readonly language: string;

  /** 文書の中のフェンスの一覧 (頭の選び手に出す)。 */
  readonly fences: (markdown: string) => readonly FenceEntry[];
  /** その行を含むフェンス。無ければ null。 */
  readonly fenceAt: (markdown: string, line: number) => FenceBlock | null;
  /** 文書の最初のフェンス。無ければ null (タブそのものがマップのときの落ち先)。 */
  readonly firstFence: (markdown: string) => FenceBlock | null;

  /**
   * 升目と帯を組む。`fenceLine` は帯の行を Markdown の行へずらすため
   * (押すとそこへ飛べる)。
   */
  readonly view: (source: string, fenceLine: number) => FenceView;
  /** フェンスの中の行 (1 始まり) と桁 (0 始まり) が指しているもの。 */
  readonly aimAt: (source: string, line: number, column: number) => Aim | null;
  /** 掴んだものが書かれている場所 (エディタで光らせる先)。 */
  readonly spansOf: (source: string, what: 'part' | 'node', id: string) => readonly Span[];
  /** 選んだ部品の欄の中身。部品でなければ null。 */
  readonly fieldsOf: (source: string, handle: string) => PartFields | null;

  /**
   * 掴んだ名札 (`VCC#2`) から、人に見せる名前 (`VCC`)。
   * **名札の綴りは、絵を描く側と編集する側の取り決め**なのでフェンスが持つ。
   */
  readonly nameOf: (handle: string) => string;
  /**
   * 置く部品に付ける ID。**知らない種類だけ null。** ID がそのまま図に出る種類
   * (circuit の `port` / `vcc`) も既定の名前で返す — 置く流れを窓で止めない
   * (KiCad が `#PWR?` で置いてから直させるのと同じ)。名前は欄で直す。
   */
  readonly nextId: (source: string, type: string) => string | null;
  /**
   * その部品が使っている穴 (書かれた綴り)。**ゴーストの光らせ先。**
   * 置く前の試し当て (`applyRewrite`) のあとに読むので、置いたときと同じ穴が光る。
   * 無い部品や穴を持たない部品は空。
   */
  readonly cellsOf: (source: string, handle: string) => readonly string[];
  /**
   * 配線を `Shift` で折れるか (`-|`)。**殻の案内文はここから組む** —
   * 決め打ちにすると、折れない板で「押しても何も起きない鍵」を案内することになる。
   */
  readonly foldsWire: boolean;

  /** パレット (置ける部品の一覧) の HTML。 */
  readonly palette: () => string;
  /** 種類の名前の候補 (`datalist`)。欄で種類を打ち替えるときに出す。 */
  readonly typeNames: (listId: string) => string;

  readonly movePart: (source: string, handle: string, to: string, trial?: Trial) => EditResult;
  readonly movePoint: (source: string, from: string, to: string, trial?: Trial) => EditResult;
  readonly addPart: (source: string, part: NewPart) => EditResult;
  readonly addWire: (source: string, from: string, to: string, operator: string) => EditResult;
  readonly deletePart: (source: string, handle: string) => EditResult;
  readonly deleteWire: (source: string, line: number) => EditResult;
  readonly rename: (source: string, handle: string, to: string) => EditResult;
  readonly setField: (source: string, handle: string, field: string, text: string) => EditResult;
  readonly turn: (source: string, handle: string, quarters: number) => EditResult;
  readonly flip: (source: string, handle: string) => EditResult;
};
