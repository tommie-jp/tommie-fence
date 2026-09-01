import type { StyleSpec, ThemeName } from '../types.ts';

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
  /** 部品の名前と値。 */
  readonly caption: string;
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
  plate: '#e8dfc4',
  plateEdge: '#c9bd96',
  hole: '#8b7f5e',
  land: '#c8a44a',
  label: '#6d6552',
  lead: '#9aa0a6',
  body: '#efe4cd',
  bodyEdge: '#b6a887',
  caption: '#3c3730',
};

/** 暗い背景のノート向け。**板は暗い緑寄り**にする (生基板を暗所で見た色)。 */
const DARK: Palette = {
  canvas: '#1b211d',
  plate: '#2f3a33',
  plateEdge: '#46554c',
  hole: '#121714',
  land: '#a8862f',
  label: '#9aa79f',
  lead: '#8d949a',
  body: '#3c4740',
  bodyEdge: '#5c6b62',
  caption: '#dfe6e1',
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
};

export function resolveStyle(style: StyleSpec): ResolvedStyle {
  return {
    theme: (style.theme === null ? null : THEMES[style.theme]) ?? THEME,
    width: style.width,
    // 既定はどちらも「言う」「刻まない」。お知らせは伏せられるが、
    // **読めなかった行はこの切り替えの対象ではない** (約束 4)。
    debug: style.debug ?? true,
    stamp: style.stamp ?? false,
  };
}
