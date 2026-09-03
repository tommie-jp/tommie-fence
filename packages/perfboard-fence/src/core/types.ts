import { THEME_NAMES } from './limits.ts';
/**
 * perfboard フェンスの型。**ブレッドボードと分けてある理由は物理**で、
 * ユニバーサル基板は全穴が独立している (列が最初から導通していない)。
 * 52 の docs/05 に、どこが共有できてどこが別なのかの実測がある。
 */

import type { Turn } from './parts/orient.ts';

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
 * 板。**導通を持たない**のが breadboard との違いで、あちらはストリップ
 * (列の 5 穴の導通) と電源レールを持つ。ここにあるのは大きさと、
 * 図に描くだけのもの (スロット用の銅箔) だけ。
 */
export type Board = BoardSize & {
  /**
   * 短いほうの両端にスロット用の銅箔を描くか。**既定は描かない。**
   * 穴ではないので挿せず、ネットにもネットリストにも出ない。
   */
  readonly slots: boolean;
  /**
   * 板 (レジスト) の色。**既定は緑。** 書かれていなければテーマが決める。
   * 板の色は実物の性質なので、テーマ (図の配色) ではなくここに持つ。
   */
  readonly color: string | null;
  /** 穴の銅箔 (ランド) の色。**既定は銀** (はんだメッキ)。 */
  readonly land: string | null;
  /** スロットの銅箔の色。**既定はランドと同じ** (同じめっきなので)。 */
  readonly slotColor: string | null;
};

/**
 * 導通グループの名前。ユニバーサル基板では穴 1 つが 1 グループになる
 * (`hole:2,3`)。ネットは配線がこれをつないだ結果として出る。
 */
export type StripId = string;

export type Point = { readonly x: number; readonly y: number };
export type Rect = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };

/** 書かれたままの部品 1 つ。**綴りを落とさない** — 報告が行の中を指せなくなる。 */
export type PartSpec = {
  readonly id: string;
  /** 略記を畳んだあとの正式名。図・部品リスト・エラーにはこれしか出さない。 */
  readonly type: string;
  readonly variant: string | null;
  /** 書かれたままの種類の綴り (`r`)。報告で行の中を指すのに要る。 */
  readonly written: string;
  /** 書かれたままの穴 (`b3`)。板に載るかは placement が見る。 */
  readonly holes: readonly string[];
  readonly value: string | null;
  /** 書かれた向き。**アンカー 1 つで置く形だけが持つ** (parts/orient.ts)。 */
  readonly turn: Turn;
  readonly line: number | null;
};

/**
 * 板に載せた部品。足は番地と導通グループの両方を持つ。
 * **行番号を運ぶ** — ERC の報告が「どの行の部品か」を言えないと直せない。
 */
export type PlacedPart = {
  readonly id: string;
  readonly type: string;
  readonly variant: string | null;
  readonly value: string | null;
  readonly line: number | null;
  readonly pins: readonly { readonly address: Address; readonly strip: StripId }[];
};

/** 板の外の機器を置く側。 */
export type DeviceSide = 'top' | 'bottom';

/**
 * 板の外の機器。**盤面には載らない**ので部品とは別に持つ。
 * 配線からは `BAT.+` の形で指す。
 */
export type DeviceSpec = {
  readonly id: string;
  /** 板のどちら側の帯に置くか。番地で置いたときは、そこから決まる向き。 */
  readonly at: DeviceSide;
  /**
   * 番地で置いたときの、その番地 (書かれたまま)。帯に並べるなら null。
   * **箱の左上がここに来る** — 足の位置は箱から決まる。
   */
  readonly where: string | null;
  readonly label: string;
  readonly pins: readonly string[];
  /** 書かれていた行。ERC のお知らせを書いた場所に返すために持つ。 */
  readonly line: number | null;
};

/**
 * 注釈の種類。**`source` と `parts` だけは板の上に置かない** — フェンスの中身
 * や部品表を丸ごと書き出すものなので、板に重ねると穴も部品も読めなくなる。
 * どちらも図の下に自分の帯を持つ。
 */
export type NoteKind = 'mark' | 'box' | 'arrow' | 'text' | 'source' | 'parts';

/** 板の上に置く注釈の種類。指し先の番地を必ず持つ。 */
export type OnBoardNoteKind = Exclude<NoteKind, 'source' | 'parts'>;

/** 書かれたままの注釈 1 つ。 */
export type NoteSpec = {
  readonly kind: NoteKind;
  /** 指し先の番地。**`source` と `parts` は板の外に出すので null**。 */
  readonly from: string | null;
  readonly to: string | null;
  readonly color: string | null;
  readonly text: string | null;
  readonly line: number | null;
};

/** 番地に直した注釈。板の上に置くものだけがここへ来る。 */
export type ResolvedNote = {
  readonly kind: OnBoardNoteKind;
  readonly from: Address;
  readonly to: Address | null;
  readonly color: string | null;
  readonly text: string | null;
};

/** `style:` に書かれた項目。**書かれたものだけ**を持ち、既定はテーマが決める。 */
/** 選べるテーマの名前。**実装のある名前と型で結ぶ** (render/theme.ts の `THEMES`)。 */
export type ThemeName = (typeof THEME_NAMES)[number];

export type StyleSpec = {
  readonly theme: ThemeName | null;
  readonly width: number | null;
  /** お知らせを図の下に出すか。読めなかった行はこれに関わらず必ず出る。 */
  readonly debug: boolean | null;
  /** 図の右下に処理系の版を刻むか。 */
  readonly stamp: boolean | null;
  /**
   * ERC と当たり判定を掛けるか。**既定は掛ける。**
   * `debug: off` が「見つけたものを伏せる」のに対し、これは**そもそも見ない**。
   */
  readonly check: boolean | null;
  /** 板の外に出す名前の付け方。書かれた項目だけを持つ。 */
  readonly labels: LabelSpec | null;
  /** 半田面 (裏返した板) も描くか。**既定は描かない。** */
  readonly back: boolean | null;
};

/** 軸の名前を英字で振るか、数字で振るか。 */
export type LabelKind = 'alpha' | 'numeric';

/** 英字の大小。 */
export type LabelCase = 'upper' | 'lower';

/** 穴の名前を出す辺。行は左右、列は上下に出る。 */
export type LabelSide = 'left' | 'right' | 'top' | 'bottom';

/**
 * 板の外の名前の付け方。**印字だけを変える** — 番地 (`b3`) は行が英字・
 * 列が数字のまま動かない。手元の板のシルクに寄せるためのもの。
 */
export type LabelSpec = {
  readonly row: LabelKind | null;
  readonly col: LabelKind | null;
  readonly case: LabelCase | null;
  /** 名前を出す辺。書かなければ既定 (左と上)。 */
  readonly sides: readonly LabelSide[] | null;
};

/** `points:` の 1 行。**行番号を落とさない** — 落とすと報告が行を指せなくなる。 */
export type PointSpec = {
  readonly name: string;
  readonly written: string;
  readonly line: number | null;
};

/** 書かれたままの配線 1 本。端は番地とも `points:` の名前とも取れる。 */
export type WireSpec = {
  readonly from: string;
  readonly to: string;
  readonly color: string | null;
  readonly line: number | null;
};

/** 端を番地に直した配線。**行番号を運ぶ** (理由は PlacedPart と同じ)。 */
export type RoutedWire = {
  readonly from: Address;
  readonly to: Address;
  readonly color: string | null;
  readonly line: number | null;
};

/**
 * 読めたフェンス。Phase 3 では板・部品・配線・点の名前まで。
 * 注釈と ERC は次の Phase でここに足す。
 */
export type FenceDocument = {
  readonly board: Board;
  /** 図の上に出す題。書かれていなければ null。 */
  readonly title: string | null;
  readonly parts: readonly PartSpec[];
  readonly wires: readonly WireSpec[];
  /** `points:` で名前を付けた穴。**定義順**で持つ (ネット名の当て方が定義順)。 */
  readonly points: readonly PointSpec[];
  readonly style: StyleSpec;
  readonly notes: readonly NoteSpec[];
  readonly devices: readonly DeviceSpec[];
};
