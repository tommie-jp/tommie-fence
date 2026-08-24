// フェンス構文からレンダリングまでで共有する型。DOM にも Node にも依存しない。

export const HOLE_ROWS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'] as const;
export type HoleRow = (typeof HOLE_ROWS)[number];

export const RAIL_ROWS = ['+t', '-t', '-b', '+b'] as const;
export type RailRow = (typeof RAIL_ROWS)[number];

export type HoleAddress = { readonly kind: 'hole'; readonly row: HoleRow; readonly col: number };

export type RailAddress = {
  readonly kind: 'rail';
  readonly polarity: '+' | '-';
  readonly side: 't' | 'b';
  readonly col: number;
};

export type Address = HoleAddress | RailAddress;

export type Point = { readonly x: number; readonly y: number };

export type Rect = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };

export type BoardSize = 'half' | 'full';

export type Board = { readonly size: BoardSize; readonly columns: number };

/** 導通グループの識別子。`top:5` / `bottom:5` / `rail:+t` / `pin:AD2.W1`。 */
export type StripId = string;

export type Net = { readonly name: string; readonly strips: readonly StripId[]; readonly refs: readonly string[] };

/** 行番号は 1 始まり。位置が特定できないときだけ null。 */
export type FenceError = { readonly message: string; readonly line: number | null };

export type Result<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: FenceError };

export type HoleRef = { readonly addr: string; readonly tag: string };

export type PartSpec = {
  readonly id: string;
  readonly type: string;
  readonly holes: readonly HoleRef[];
  readonly value: string | null;
  readonly label: string | null;
  readonly at: 'top' | 'bottom' | null;
  readonly pins: readonly string[] | null;
  readonly line: number;
};

/** 配線の迂回ヒント。`v-20` で上へ 20 (= 穴 1 つぶん)、`h30` で右へ 30。 */
export type WireHint = { readonly axis: 'v' | 'h'; readonly delta: number };

export type WireSpec = {
  readonly from: string;
  readonly to: string;
  readonly color: string | null;
  readonly hints: readonly WireHint[];
  readonly line: number;
};

export type FenceDocument = {
  readonly board: BoardSize;
  readonly parts: readonly PartSpec[];
  readonly wires: readonly WireSpec[];
};

export type PartKind = 'two-lead' | 'three-lead' | 'dip' | 'device';

export type PlacedPin = { readonly name: string; readonly address: Address | null };

export type PlacedPart = {
  readonly id: string;
  readonly type: string;
  readonly kind: PartKind;
  readonly pins: readonly PlacedPin[];
  readonly value: string | null;
  readonly label: string | null;
  readonly at: 'top' | 'bottom' | null;
  readonly line: number;
};
