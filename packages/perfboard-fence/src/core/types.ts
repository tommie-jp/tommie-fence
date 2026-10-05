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
export const TOP_LEVEL_KEYS = ['title', 'points', 'unused', 'shorted', 'board', 'style', 'parts', 'wires', 'notes'] as const;

export type TopLevelKey = (typeof TOP_LEVEL_KEYS)[number];

/** 穴の番地。行も列も 1 始まり。行の名前は `a` `b` … `aa` (address.ts)。 */
/**
 * 穴の番地。**交点の間も指せる** (`rows` / `cols` は 1 升に対する端数)。
 * 端数を書けるのは注釈だけで、ピンは穴に挿すので交点そのものを指す
 * (`isCrossing` が見張る)。**端数が無ければ鍵ごと持たない** — 交点の番地は
 * 今までと同じ形のままにする (`{ row, col }` を比べているところが多い)。
 */
export type Address = {
  readonly row: number;
  readonly col: number;
  readonly rows?: number;
  readonly cols?: number;
};

/**
 * 基板のシルク (番地の英字と数字の振り方)。**番地の綴りは図の端の名前と同じ** —
 * 基板を見て綴りを書き、図を見て半田付けするので、3 つが同じ名前でないと取り違える。
 *
 * - `fence` — 英字が行 (上から)、数字が列 (左から)。breadboard フェンスと同じ
 * - `alpha-rows` — 英字が行 (下から)、数字が列 (左から)。秋月の基板
 * - `alpha-cols` — 英字が列 (左から)、数字が行 (下から)。横に置いた汎用 5x7cm
 */
export type Silk = 'fence' | 'alpha-rows' | 'alpha-cols';

/** 番地を読み書きするのに要る基板の面 (行数は「下から」の数え方に使う)。 */
export type Spelling = { readonly silk: Silk; readonly rows: number };

/** 基板の大きさ。列 × 行 (基板の呼び方と同じ順)。 */
export type BoardSize = { readonly cols: number; readonly rows: number };

/**
 * 基板。**導通を持たない**のが breadboard との違いで、あちらはストリップ
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
   * 番地の振り方 (基板のシルク)。**名前の基板はその基板の刷りどおり**、
   * 穴数直書きの基板は `fence` (シルクを知らない)。`board: silk:` で替えられる。
   */
  readonly silk: Silk;
  /**
   * 基板 (レジスト) の色。**既定は緑。** 書かれていなければテーマが決める。
   * 基板の色は実物の性質なので、テーマ (図の配色) ではなくここに持つ。
   */
  readonly color: string | null;
  /** 穴の銅箔 (ランド) の色。**既定は銀** (はんだメッキ)。 */
  readonly land: string | null;
  /** スロットの銅箔の色。**既定はランドと同じ** (同じめっきなので)。 */
  readonly slotColor: string | null;
  /**
   * 基材の厚さ (mm)。**既定は 1.6** — 手に入るユニバーサル基板の厚み。
   * 綴りは copper フェンスの `h:` と同じ。断面を描くときの値で、
   * **いまの図 (上から見た基板) は変わらない**。
   */
  readonly h: number;
  /** 基材 (`FR-4` など)。**既定は `FR-4`**。`h` と同じく断面を描くときの値。 */
  readonly material: BoardMaterial;
};

/**
 * 基材の呼び名。**売り場の表記に揃える** (ガラスエポキシ = `FR-4`、
 * ガラスコンポジット = `CEM-3`、紙フェノール = `FR-1` / `FR-2`、紙エポキシ = `FR-3`)。
 */
export type BoardMaterial = 'FR-4' | 'CEM-3' | 'CEM-1' | 'FR-1' | 'FR-2' | 'FR-3';

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
  /** 書かれたままの穴 (`b3`)。基板に載るかは placement が見る。 */
  readonly holes: readonly string[];
  readonly value: string | null;
  /** 書かれた向き。**アンカー 1 つで置く形だけが持つ** (parts/orient.ts)。 */
  readonly turn: Turn;
  readonly line: number | null;
};

/**
 * 基板に載せた部品。ピンは番地と導通グループの両方を持つ。
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

/** 基板の外の機器を置く側。 */
export type DeviceSide = 'top' | 'bottom';

/**
 * 基板の外の機器。**盤面には載らない**ので部品とは別に持つ。
 * 配線からは `BAT.+` の形で指す。
 */
export type DeviceSpec = {
  readonly id: string;
  /** 基板のどちら側の帯に置くか。番地で置いたときは、そこから決まる向き。 */
  readonly at: DeviceSide;
  /**
   * 番地で置いたときの、その番地 (書かれたまま)。帯に並べるなら null。
   * **箱の左上がここに来る** — ピンの位置は箱から決まる。
   */
  readonly where: string | null;
  readonly label: string;
  readonly pins: readonly string[];
  /** 書かれていた行。ERC のお知らせを書いた場所に返すために持つ。 */
  readonly line: number | null;
};

/**
 * 注釈の種類。**`source` と `parts` だけは基板の上に置かない** — フェンスの中身
 * や部品表を丸ごと書き出すものなので、基板に重ねると穴も部品も読めなくなる。
 * どちらも図の下に自分の帯を持つ。
 */
export type NoteKind = 'mark' | 'box' | 'arrow' | 'text' | 'source' | 'parts';

/**
 * `text` の字の見た目。**目立たせたい字だけ**に書く (`- text p2 red large bold: IN 5V`)。
 * 書かなければ両方 false で、ほかの字と同じ大きさ・太さ・薄さで出る。
 */
export type TextLook = {
  /** 字を大きく (基板に書く字の 1.4 倍。breadboard の `large` と同じ比)。 */
  readonly large: boolean;
  /** 字を太く。 */
  readonly bold: boolean;
  /**
   * 字を穴のどの脇へ置くか。`left` は穴の左 (字の右端が穴のそば)、`right` は穴の右、
   * `center` は穴の真ん中 (字の中心が穴の真上、穴と同じ高さ)。
   * 書かなければ null で、穴の上に置く。丸 (`mark`) のすぐ脇に名前を書くときに使う。
   */
  readonly side: 'left' | 'right' | 'center' | null;
};

/** 見た目の語を書かなかった字。 */
export const PLAIN_LOOK: TextLook = { large: false, bold: false, side: null };

/** 基板の上に置く注釈の種類。指し先の番地を必ず持つ。 */
export type OnBoardNoteKind = Exclude<NoteKind, 'source' | 'parts'>;

/** 書かれたままの注釈 1 つ。 */
export type NoteSpec = {
  readonly kind: NoteKind;
  /** 向き (`- text b3 r90: 字` の `r90`)。`text` 以外はいつも向き無し。 */
  readonly turn: Turn;
  /** 字の見た目 (`large` `bold`)。`text` 以外はいつも `PLAIN_LOOK`。 */
  readonly look: TextLook;
  /** 指し先の番地。**`source` と `parts` は基板の外に出すので null**。 */
  readonly from: string | null;
  readonly to: string | null;
  readonly color: string | null;
  readonly text: string | null;
  readonly line: number | null;
  /**
   * 書かれた語 (**種類の語も含む**)。**そのまま書き戻す**ために持つ
   * (52 の docs/54 の段 1) — 色と向きの語は並びが自由なので、読んだ値からは
   * 書かれた形に戻せない。
   */
  readonly written: readonly string[];
  /**
   * `text` の本文を書かれたまま (**引用符も含む**)。規則で引用し直すと、
   * 要らない引用を外してしまう行がある。`text` 以外は null。
   */
  readonly bodyWritten: string | null;
};

/** 番地に直した注釈。基板の上に置くものだけがここへ来る。 */
export type ResolvedNote = {
  readonly kind: OnBoardNoteKind;
  /** 向き (`- text b3 r90: 字` の `r90`)。`text` 以外はいつも向き無し。 */
  readonly turn: Turn;
  /** 字の見た目 (`large` `bold`)。`text` 以外はいつも `PLAIN_LOOK`。 */
  readonly look: TextLook;
  readonly from: Address;
  readonly to: Address | null;
  readonly color: string | null;
  readonly text: string | null;
  /**
   * 書かれた行。**注釈の掴み手はこれ** — 部品と違って名前が無いので、
   * 行そのもので指す (配線と同じ考え方)。読めない行から来た注釈は null。
   */
  readonly line: number | null;
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
  /** 基板の外に出す名前の付け方。書かれた項目だけを持つ。 */
  readonly labels: LabelSpec | null;
  /** 半田面 (裏返した基板) も描くか。**既定は描かない。** */
  readonly back: boolean | null;
};

/** 英字の大小。 */
export type LabelCase = 'upper' | 'lower';

/** 穴の名前を出す辺。行は左右、列は上下に出る。 */
export type LabelSide = 'left' | 'right' | 'top' | 'bottom';

/**
 * 基板の外の名前の付け方。**印字だけを変える** — 番地 (`b3`) は行が英字・
 * 列が数字のまま動かない。手元の基板のシルクに寄せるためのもの。
 */
export type LabelSpec = {
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
 * 読めたフェンス。Phase 3 では基板・部品・配線・点の名前まで。
 * 注釈と ERC は次の Phase でここに足す。
 */
/** `unused:` の 1 項目。ピンの名前 (`ID.ピン名`) と、書かれた行。 */
export type UnusedSpec = {
  readonly ref: string;
  readonly line: number | null;
};

export type FenceDocument = {
  readonly board: Board;
  /** `board:` に名前 (または実寸) で書かれた基板の名前。穴数の直書きなら null。部品表に出す。 */
  readonly boardName: string | null;
  /** 図の上に出す題。書かれていなければ null。 */
  readonly title: string | null;
  readonly parts: readonly PartSpec[];
  readonly wires: readonly WireSpec[];
  /** `points:` で名前を付けた穴。**定義順**で持つ (ネット名の当て方が定義順)。 */
  readonly points: readonly PointSpec[];
  /** `unused:` に書いた、**意図して使わないピン** (`J1.D+`)。ERC の「どこにもつながっていない」から外す。 */
  readonly unused: readonly UnusedSpec[];
  /** `shorted:` に書いた、**意図して短絡した部品** (`J2`)。ERC の「ピンが全部同じネット」から外す。 */
  readonly shorted: readonly UnusedSpec[];
  readonly style: StyleSpec;
  readonly notes: readonly NoteSpec[];
  readonly devices: readonly DeviceSpec[];
};
