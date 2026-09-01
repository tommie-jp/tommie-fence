/**
 * perfboard フェンスの型。**ブレッドボードと分けてある理由は物理**で、
 * ユニバーサル基板は全穴が独立している (列が最初から導通していない)。
 * 52 の docs/05 に、どこが共有できてどこが別なのかの実測がある。
 */

export type FenceError = {
  readonly message: string;
  readonly line: number | null;
  /** 読めなかった綴り。行の中で 1 か所に決まるときだけ、報告に印が付く。 */
  readonly token?: string;
  /** その行の中身。`attachSourceText` が添える。 */
  readonly text?: string;
  /** 行の中で指す範囲 (0 始まりの桁と、コードポイントで数えた長さ)。 */
  readonly at?: { readonly column: number; readonly length: number };
  /** お知らせ (読めているが思ったとおりに出ない)。 */
  readonly notice?: boolean;
};

/**
 * フェンスの一番外側に書けるキー。知らないキーを名指すのにも使う。
 * **Phase 0 では語彙を決めるだけ**で、中身の検証は Phase 1 以降。
 */
export const TOP_LEVEL_KEYS = ['title', 'points', 'board', 'style', 'parts', 'wires', 'notes'] as const;

export type TopLevelKey = (typeof TOP_LEVEL_KEYS)[number];

/** 穴の番地。行も列も 1 始まり。行の名前は `a` `b` … `aa` (address.ts)。 */
export type Address = { readonly row: number; readonly col: number };

/** 板の大きさ。列 × 行 (板の呼び方と同じ順)。 */
export type BoardSize = { readonly cols: number; readonly rows: number };

/**
 * 板。**大きさしか持たない**のが breadboard との違いで、あちらは
 * ストリップ (列の 5 穴の導通) と電源レールを持つ。
 */
export type Board = BoardSize;

/**
 * 導通グループの名前。ユニバーサル基板では穴 1 つが 1 グループになる
 * (`hole:2,3`)。ネットは配線がこれをつないだ結果として出る。
 */
export type StripId = string;

export type Point = { readonly x: number; readonly y: number };
export type Rect = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };

/**
 * 読めたフェンス。Phase 1 では板だけを持つ。
 * 部品・配線・注釈は Phase 2 以降でここに足す。
 */
export type FenceDocument = {
  readonly board: Board;
};
