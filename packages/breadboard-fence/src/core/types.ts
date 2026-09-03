// フェンス構文からレンダリングまでで共有する型。DOM にも Node にも依存しない。

import type { Turn } from './parts/orient.ts';
import type { NoteAlign, NoteColor, NoteKind, NoteLeading, NotePlace, NoteSize } from './notes.ts';

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

/** 実売のサイズ系列に合わせた 3 段。mini は 170 穴 (17 列)、half は 400 穴、full は 830 穴。 */
export const BOARD_SIZES = ['mini', 'half', 'full'] as const;
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
  /**
   * 電源レールの並び。**null はレールが無いボード** (170 穴のミニなど)。
   * 実物でもレールは両面テープ留めの独立ストリップで、剥がしたり継ぎ足したりできるので、
   * サイズとは独立に持つ。
   */
  readonly rails: RailOrder | null;
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

/**
 * 読めなかったところと、読めてはいるが思ったとおりに出ないところ。
 * 行番号は 1 始まりで、位置が特定できないときだけ null。
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
  /** お知らせ (読めているが思ったとおりに出ない)。`style: debug: off` で伏せられる。 */
  readonly notice?: boolean;
};

export type Result<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: FenceError };

export type HoleRef = { readonly addr: string; readonly tag: string };

export type PartSpec = {
  readonly id: string;
  readonly type: string;
  /**
   * 書かれたままの種類の綴り (`c/foo`)。略記を畳んだあとの `type` とは違うことがある。
   * **報告で行の中の綴りを指すのに要る** — 畳んだ綴りは行のどこにも無いので、
   * それで探すと印が消えるか、たまたま同じ字が並んだ別の語を指す。
   */
  readonly written: string;
  /** 姿 (`capacitor/ceramic` の `/` の後ろ)。書かれなければ null で、種類ごとの既定で描く。 */
  readonly variant: string | null;
  readonly holes: readonly HoleRef[];
  /**
   * 向き。**アンカー 1 つで置く形 (DIP / SIP / ボード) だけ**が持つ。
   * 足を並べて書く部品の向きは穴の順そのものなので、語では書かない
   * (`parts/orient.ts`)。
   */
  readonly turn: Turn;
  readonly value: string | null;
  readonly label: string | null;
  readonly at: 'top' | 'bottom' | null;
  readonly pins: readonly string[] | null;
  /**
   * 読めはしたが、書いたとおりには図に出ない指定の理由。
   * **図は書いたとおりに描いたうえで**お知らせに出す
   * (マップ形式の `schema.ts` が返すものと同じ立て付け)。
   */
  readonly notes?: readonly string[];
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

/**
 * フェンスの `notes:` に書かれた注釈 1 つ。**回路の一員ではない**ので、
 * ネットにも部品リストにも数えない。語彙は `src/core/notes.ts`。
 */
export type NoteSpec = {
  readonly kind: NoteKind;
  /**
   * 部品 ID か穴番地。circle は 1 つ、box / arrow / line は 2 つ。
   * `text` / `source` は**場所を書かなければ空**で、`place` のほうが効く。
   */
  readonly targets: readonly string[];
  /** 図の外に置く場所。番地を書いたときは null。 */
  readonly place: NotePlace | null;
  readonly color: NoteColor | null;
  readonly size: NoteSize | null;
  readonly align: NoteAlign | null;
  readonly bold: boolean;
  /** `box` の枠を実線にする。既定は破線。 */
  readonly solid: boolean;
  /** `source` の行送り。 */
  readonly leading: NoteLeading | null;
  /** `text` に書かれた字。それ以外は null。 */
  readonly text: string | null;
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
  /** お知らせを図の下に出すか。読めなかった行はこれに関わらず必ず出る。 */
  readonly debug: boolean | null;
  /** 図の右下に処理系の版を刻むか。 */
  readonly stamp: boolean | null;
  /**
   * 図の中身の検査を掛けるか (`check: off` で外す)。null は既定の on。
   *
   * **`debug: off` とは違う。** あちらは「言うのをやめる」、こちらは
   * **「見るのをやめる」**。まだ描きかけの図で外す。外れるのは
   * **読めているものへの検査**だけで、読めなかった行は必ず出る。
   */
  readonly check: boolean | null;
  /** `style:` が書かれた行。読めなかった項目の報告に使う。 */
  readonly line: number | null;
};

export type FenceDocument = {
  /** 図の左上に載せる 1 行の題。書かなければ null。 */
  readonly title: string | null;
  readonly board: BoardSpec;
  readonly style: StyleSpec;
  readonly partsList: PartsListMode;
  /** `points:` の名前 → 穴番地。番地はもう部品や配線に埋め込んであり、ネット名に使う。 */
  readonly points: ReadonlyMap<string, string>;
  readonly parts: readonly PartSpec[];
  readonly wires: readonly WireSpec[];
  readonly notes: readonly NoteSpec[];
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
  /** 書かれたままの種類の綴り。報告で行の中の綴りを指すのに使う。 */
  readonly written: string;
  /** 姿。`placement/place.ts` で種類に合うことを確かめてある。 */
  readonly variant: string | null;
  readonly kind: PartKind;
  readonly pins: readonly PlacedPin[];
  readonly bridges: readonly PinBridge[];
  readonly value: string | null;
  readonly label: string | null;
  readonly at: 'top' | 'bottom' | null;
  readonly line: number;
};
