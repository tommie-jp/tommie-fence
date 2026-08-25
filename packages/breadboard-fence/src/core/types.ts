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

export const BOARD_SIZES = ['half', 'full'] as const;
export type BoardSize = (typeof BOARD_SIZES)[number];

/** レール 4 本の上から下への並び。既定は実物で最も普及した +--+ (RAIL_ROWS の順)。 */
export type RailOrder = readonly [RailRow, RailRow, RailRow, RailRow];

export const LETTER_CASES = ['lower', 'upper'] as const;
export type LetterCase = (typeof LETTER_CASES)[number];

export const COLUMN_NUMBERS = ['every-5', 'all'] as const;
export type ColumnNumbers = (typeof COLUMN_NUMBERS)[number];

/**
 * フェンスの `board:` に書かれたボードの種類と印字。印字はメーカーごとに割れているので
 * 手元のボードに図を寄せられるようにする。番地系はどの印字でも共通。
 */
export type BoardSpec = {
  readonly size: BoardSize;
  readonly rails: RailOrder;
  readonly letters: LetterCase;
  readonly numbers: ColumnNumbers;
};

export const DEFAULT_BOARD: BoardSpec = {
  size: 'half',
  rails: RAIL_ROWS,
  letters: 'lower',
  numbers: 'every-5',
};

export type Board = BoardSpec & { readonly columns: number };

/**
 * フェンスの `parts-list:` に書く、部品リストの出し方。
 * 既定で出すのは、図だけを渡されても何を用意すればよいか分かるようにするため。
 */
export const PARTS_LIST_MODES = ['below', 'none'] as const;
export type PartsListMode = (typeof PARTS_LIST_MODES)[number];

export const DEFAULT_PARTS_LIST: PartsListMode = 'below';

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

export type StyleRange = { readonly min: number; readonly max: number };

/**
 * フェンスの `style:` に書かれた見た目の指定。書かれなかったところは null で、
 * 解決 (`render/theme.ts`) のときにテーマの値が入る。色は `#rrggbb` に揃えてある。
 */
export type StyleSpec = {
  readonly theme: string | null;
  readonly textSize: number | null;
  readonly textColor: string | null;
  readonly textBackground: string | null;
  readonly wireWidth: number | null;
  readonly boardColor: string | null;
  readonly holeSize: number | null;
  readonly holeColor: string | null;
  readonly width: number | null;
  /** `style:` が書かれた行。読めなかった項目の報告に使う。 */
  readonly line: number | null;
};

export type FenceDocument = {
  readonly board: BoardSpec;
  readonly style: StyleSpec;
  readonly partsList: PartsListMode;
  readonly parts: readonly PartSpec[];
  readonly wires: readonly WireSpec[];
};

export type PartKind = 'two-lead' | 'three-lead' | 'switch' | 'dip' | 'sip' | 'board' | 'device';

export type PlacedPin = { readonly name: string; readonly address: Address | null };

/**
 * 部品の中でつながっている足の組。**押した・倒した状態に依らない導通だけ**を載せる
 * (タクトスイッチの同じ側の 2 本など)。ネットの導出はこれも配線と同じ結び目として扱うので、
 * 状態で変わる導通を入れるとネットリストが嘘になる。
 */
export type PinBridge = readonly [string, string];

export type PlacedPart = {
  readonly id: string;
  readonly type: string;
  readonly kind: PartKind;
  readonly pins: readonly PlacedPin[];
  readonly bridges: readonly PinBridge[];
  readonly value: string | null;
  readonly label: string | null;
  readonly at: 'top' | 'bottom' | null;
  readonly line: number;
};
