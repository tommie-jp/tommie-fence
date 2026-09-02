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

/** 選んだ部品の欄。**中身は素通し** — 殻は webview へ渡すだけで、意味を見ない。 */
export type PartFields = {
  readonly id: string;
  readonly type: string;
  /** 端子の数。欄に出せるものが変わる (フェンスごとの語)。 */
  readonly kind: string;
  readonly value: string;
  readonly label: string;
};

/** 置く部品。番地は**書かれた綴り**で渡す。 */
export type NewPart = {
  readonly id: string;
  readonly type: string;
  readonly at: readonly string[];
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
  /** 置く部品に付ける ID。**訊くしかない種類は null** (ID が図に出るもの)。 */
  readonly nextId: (source: string, type: string) => string | null;
  /** 名前を訊くときの既定の候補。無ければ空。 */
  readonly nameHint: (type: string) => string;

  /** パレット (置ける部品の一覧) の HTML。 */
  readonly palette: () => string;
  /** 種類の名前の候補 (`datalist`)。欄で種類を打ち替えるときに出す。 */
  readonly typeNames: (listId: string) => string;

  readonly movePart: (source: string, handle: string, to: string) => EditResult;
  readonly movePoint: (source: string, from: string, to: string) => EditResult;
  readonly addPart: (source: string, part: NewPart) => EditResult;
  readonly addWire: (source: string, from: string, to: string, operator: string) => EditResult;
  readonly deletePart: (source: string, handle: string) => EditResult;
  readonly deleteWire: (source: string, line: number) => EditResult;
  readonly rename: (source: string, handle: string, to: string) => EditResult;
  readonly setField: (source: string, handle: string, field: string, text: string) => EditResult;
  readonly turn: (source: string, handle: string, quarters: number) => EditResult;
  readonly flip: (source: string, handle: string) => EditResult;
};
