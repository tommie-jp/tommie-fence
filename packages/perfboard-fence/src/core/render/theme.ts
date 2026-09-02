import { LAND_COLORS, PLATE_COLORS, darken, landValue, plateValue, textOn, wireOn } from './finish.ts';
import type { Board, LabelCase, LabelKind, LabelSide, StyleSpec, ThemeName } from '../types.ts';

/**
 * 板と印字の配色と寸法。
 *
 * **配色だけがテーマで動く。** 寸法 (穴の大きさ・字の大きさ) は 3 つとも同じで、
 * 図の形はテーマで変わらない — 同じフェンスを別のテーマで出しても、
 * 部品の位置も線の通り道も動かない。
 *
 * breadboard の `theme.ts` (317 行) には溝やレールの寸法が混ざっていて
 * そのままでは使えないので、要る分だけをここに持つ。
 */

export type Palette = {
  /**
   * 図の地の色。**null なら塗らない** — 貼った先の背景が透ける。
   *
   * 既定の light は透明のまま (プレビューの地に馴染ませる)。板の外に出る字
   * (題・行と列の名前) は地の上に乗るので、**地を決めたテーマは必ず塗る** —
   * 塗らないと、暗い字を暗い背景に置いたときに黙って消える。
   * breadboard-fence の `canvas` と同じ考え方。
   */
  readonly canvas: string | null;
  /** 板の地の色。生基板のガラスエポキシに寄せる。 */
  readonly plate: string;
  readonly plateEdge: string;
  /** 穴の内側 (抜けている所)。 */
  readonly hole: string;
  /** 穴のまわりのランド (はんだが乗る銅箔)。 */
  readonly land: string;
  /** 行と列の名前。 */
  readonly label: string;
  /** 部品の足 (リード線)。 */
  readonly lead: string;
  /** 部品の胴。**実物の色を持つ部品 (LED・カラーコード) はここを使わない** — 
   * あちらは fence-kit の色で、テーマから触らせない。 */
  readonly body: string;
  readonly bodyEdge: string;
  /** 部品の名前と値。**板の外に出す字** (題・書き出し) もこれ。 */
  readonly caption: string;
  /**
   * **板の上に置く字** (部品の名前・注釈)。板の外の字 (`caption`) と分けてある —
   * 板の色を選べるので、一緒にすると白い板に白い字か、緑の板に黒い字の
   * どちらかが必ず読めなくなる。
   */
  readonly plateText: string;
  /** スロット用の銅箔。既定はランドと同じ (同じめっきなので)。 */
  readonly slot: string;
  /**
   * **色を書かなかった配線の色。** 板の明るさから決める — 既定を 1 つの灰色に
   * 固定すると、同じ濃さの板で線が沈む。書かれた色はこれに関わらずそのまま。
   */
  readonly wire: string;
};

export type Metrics = {
  /** 穴の直径。ピッチ (20) より必ず小さく。 */
  readonly holeSize: number;
  /** ランドの外径。 */
  readonly landSize: number;
  readonly textSize: number;
  /** 配線の濃さ。少し透かして、下の穴の位置が読めるようにする。 */
  readonly wireOpacity: number;
  /** 箱で描く部品の胴の濃さ。**足の穴を隠しきらない**ように少し透かす。 */
  readonly bodyOpacity: number;
};

export type Theme = { readonly palette: Palette; readonly metrics: Metrics };

const LIGHT: Palette = {
  canvas: null,
  // **既定は緑にはんだメッキ** — いちばん多い板の見た目。手元の板が別の色なら
  // `board:` の `color:` / `land:` で寄せられる (テーマではなく板の性質なので)。
  plate: PLATE_COLORS.green as string,
  plateEdge: darken(PLATE_COLORS.green as string),
  hole: '#14261c',
  land: LAND_COLORS.silver as string,
  label: '#6d6552',
  lead: '#9aa0a6',
  body: '#efe4cd',
  bodyEdge: '#b6a887',
  caption: '#3c3730',
  plateText: textOn(PLATE_COLORS.green as string),
  slot: LAND_COLORS.silver as string,
  wire: wireOn(PLATE_COLORS.green as string),
};

/** 暗い背景のノート向け。**板は暗い緑**にする (緑のレジストを暗所で見た色)。 */
const DARK: Palette = {
  canvas: '#1b211d',
  plate: '#1c4a31',
  plateEdge: '#2f6b47',
  hole: '#0d1b13',
  land: '#9aa3ab',
  label: '#9aa79f',
  lead: '#8d949a',
  body: '#3c4740',
  bodyEdge: '#5c6b62',
  caption: '#dfe6e1',
  plateText: '#e8efe9',
  slot: '#9aa3ab',
  wire: '#e6ebef',
};

/** 白黒で刷る資料向け。**色で意味を持たせない** — 形と濃さだけで読ませる。 */
const MONO: Palette = {
  canvas: '#ffffff',
  plate: '#ffffff',
  plateEdge: '#5a5a5a',
  hole: '#3a3a3a',
  land: '#b4b4b4',
  label: '#4a4a4a',
  lead: '#7a7a7a',
  body: '#f2f2f2',
  bodyEdge: '#5a5a5a',
  caption: '#1a1a1a',
  plateText: '#1a1a1a',
  slot: '#b4b4b4',
  wire: '#3a3a3a',
};

const METRICS: Metrics = {
  holeSize: 4,
  landSize: 9,
  textSize: 9,
  wireOpacity: 0.9,
  bodyOpacity: 0.92,
};

/**
 * **選べる名前 (`THEME_NAMES`) と、実装があるものを型で結ぶ。**
 * 別々に持つと、名前だけ足したときに `style: sepia` が通って中身は light、
 * という**黙って効かない指定**が生まれる。
 */
export const THEMES: Record<ThemeName, Theme> = {
  light: { palette: LIGHT, metrics: METRICS },
  dark: { palette: DARK, metrics: METRICS },
  mono: { palette: MONO, metrics: METRICS },
};

/** 既定のテーマ。`style:` で選ばなければこれ。 */
export const THEME: Theme = THEMES.light;

/**
 * `style:` を、描く側が使う形に畳む。**書かれなかった項目の既定はここだけ**に置く
 * (パーサ側に既定を持たせると、テーマを足したとき既定が 2 か所へ散る)。
 */
export type ResolvedStyle = {
  readonly theme: Theme;
  readonly width: number | null;
  readonly debug: boolean;
  readonly stamp: boolean;
  /** ERC と当たり判定を掛けるか (`style: check`)。 */
  readonly check: boolean;
  /** 板の外に出す名前の付け方。 */
  readonly labels: ResolvedLabels;
  /** 半田面も描くか。 */
  readonly back: boolean;
};

/** 名前の付け方。**既定は行が英字・列が数字で、英字は大文字**。 */
export type ResolvedLabels = {
  readonly row: LabelKind;
  readonly col: LabelKind;
  readonly case: LabelCase;
  /** 名前を出す辺。**既定は左と上だけ**。 */
  readonly sides: readonly LabelSide[];
};

export function resolveStyle(style: StyleSpec): ResolvedStyle {
  return {
    theme: (style.theme === null ? null : THEMES[style.theme]) ?? THEME,
    width: style.width,
    // 既定はどちらも「言う」「刻まない」。お知らせは伏せられるが、
    // **読めなかった行はこの切り替えの対象ではない** (約束 4)。
    debug: style.debug ?? true,
    stamp: style.stamp ?? false,
    // **既定は掛ける。** 全穴独立の板では繋ぎ忘れが図の上で沈黙するので、
    // 見張りを外すのは書いた人がそう言ったときだけにする。
    check: style.check ?? true,
    labels: {
      // 行が英字・列が数字は**今までの図と同じ**。英字を大文字にしたのは、
      // 板のシルク (秋月 C タイプの A・E・J・O) が大文字だから。
      row: style.labels?.row ?? 'alpha',
      col: style.labels?.col ?? 'numeric',
      case: style.labels?.case ?? 'upper',
      // **既定は左と上だけ。** 4 辺に出すと、小さい板では名前のほうが目立つ。
      sides: style.labels?.sides ?? ['left', 'top'],
    },
    // **既定は描かない。** 要るのは実際に半田付けするときだけで、
    // 図の高さが倍になる (貼る先で場所を取る)。
    back: style.back ?? false,
  };
}

/**
 * その板の仕上げを映したテーマ。**板の色もランドの色も板の性質**なので、
 * テーマ (図の配色) ではなく `board:` に書く。ここでは書かれた分だけを
 * 差し替えたテーマを作り、**板の側を描く呼び出しにだけ**渡す。
 *
 * 板の外に出るもの (題・書き出し・行と列の名前・板の外の機器) には元のテーマを
 * 渡す — 板の色を変えても、紙の上の字の色まで動く筋合いはない。
 */
export function themeForBoard(board: Board, theme: Theme): Theme {
  const plate = board.color === null ? null : plateValue(board.color);
  const land = board.land === null ? null : landValue(board.land);
  const slot = board.slotColor === null ? null : landValue(board.slotColor);
  if (plate === null && land === null && slot === null) return theme;

  return {
    ...theme,
    palette: {
      ...theme.palette,
      ...(plate === null ? {} : {
        plate,
        plateEdge: darken(plate),
        // 穴は板に開いた影。板の色から作らないと、色を変えたとき穴だけ取り残される。
        hole: darken(plate, 0.7),
        plateText: textOn(plate),
        // 板が変われば、色を書かなかった線の色も変わる。
        wire: wireOn(plate),
      }),
      // ランドを変えたらスロットも同じめっき。別に書かれていればそちらが勝つ。
      ...(land === null ? {} : { land, slot: land }),
      ...(slot === null ? {} : { slot }),
    },
  };
}
