import type { StyleSpec, ThemeName } from '../types.ts';

/**
 * 図の配色と寸法。**配色だけがテーマで動く** — 寸法は 3 つとも同じで、
 * 同じフェンスを別のテーマで出しても形は動かない (perfboard と同じ約束)。
 */
export type Palette = {
  /** 図の地。null なら塗らない (貼った先の背景が透ける)。 */
  readonly canvas: string | null;
  /** 銅を剥がした基材 (FR4 の地)。 */
  readonly substrate: string;
  readonly substrateEdge: string;
  /** 銅。 */
  readonly copper: string;
  /** 表が地の板で、切った溝 (基材が見える所)。 */
  readonly groove: string;
  /** 裏の切り欠き (破線) と、裏の物の線。 */
  readonly hidden: string;
  /** via の穴。 */
  readonly hole: string;
  /** 方眼。 */
  readonly grid: string;
  /** 目盛と板の外の数字。 */
  readonly label: string;
  /** 題・板の説明・部品の名札。 */
  readonly caption: string;
  /** 線路に添える字 (幅と Z0)。 */
  readonly lineText: string;
  /** 板の上の字の縁取り。 */
  readonly halo: string;
  /** 足・ジャンパの半田。 */
  readonly solder: string;
  readonly lead: string;
  /** 色を書かなかったジャンパ。 */
  readonly wire: string;
  /** 箱の胴。 */
  readonly box: string;
  readonly boxEdge: string;
  readonly boxText: string;
  /** 同軸の中心導体 (金めっき)。白黒の図では灰。 */
  readonly pin: string;
};

export type Metrics = {
  readonly textSize: number;
  /** 線路の字。板の上に載るので本文より一回り小さい。 */
  readonly lineTextSize: number;
};

export type Theme = { readonly palette: Palette; readonly metrics: Metrics };

const LIGHT: Palette = {
  canvas: null,
  // FR4 の地 (銅を剥がした後の、黄味のあるガラスエポキシ)。
  substrate: '#ddd3a1',
  substrateEdge: '#a69b66',
  copper: '#d08b4c',
  groove: '#6f6436',
  hidden: '#6f6335',
  hole: '#2a2620',
  grid: '#5c5230',
  label: '#6d6552',
  caption: '#3c3730',
  lineText: '#2a2418',
  halo: '#f3ecd0',
  solder: '#d7dce1',
  lead: '#9aa0a6',
  wire: '#3a3a3a',
  box: '#2b2f36',
  boxEdge: '#12151a',
  boxText: '#e8ebf0',
  pin: '#d8b64a',
};

const DARK: Palette = {
  canvas: '#1b1d21',
  substrate: '#48432c',
  substrateEdge: '#6b6443',
  copper: '#b8743c',
  groove: '#15130b',
  hidden: '#b3a66e',
  hole: '#0e0d0a',
  grid: '#d9cfa0',
  label: '#9aa79f',
  caption: '#dfe6e1',
  lineText: '#f1ead2',
  halo: '#2a2717',
  solder: '#c9ced4',
  lead: '#8d949a',
  wire: '#e6ebef',
  box: '#12161b',
  boxEdge: '#5c6b62',
  boxText: '#eef1f6',
  pin: '#d8b64a',
};

/** 白黒で刷る資料向け。**銅は薄い灰、溝は白** — 色で意味を持たせない。 */
const MONO: Palette = {
  canvas: '#ffffff',
  substrate: '#ffffff',
  substrateEdge: '#3a3a3a',
  copper: '#c4c4c4',
  groove: '#ffffff',
  hidden: '#3a3a3a',
  hole: '#000000',
  grid: '#000000',
  label: '#4a4a4a',
  caption: '#1a1a1a',
  lineText: '#000000',
  halo: '#ffffff',
  solder: '#8a8a8a',
  lead: '#6a6a6a',
  wire: '#3a3a3a',
  box: '#000000',
  boxEdge: '#000000',
  boxText: '#ffffff',
  pin: '#9a9a9a',
};

const METRICS: Metrics = { textSize: 9, lineTextSize: 7.5 };

export const THEMES: Record<ThemeName, Theme> = {
  light: { palette: LIGHT, metrics: METRICS },
  dark: { palette: DARK, metrics: METRICS },
  mono: { palette: MONO, metrics: METRICS },
};

export type ResolvedStyle = {
  readonly theme: Theme;
  readonly width: number | null;
  readonly debug: boolean;
  readonly stamp: boolean;
  readonly check: boolean;
  readonly grid: boolean;
};

/** `style:` を描く側の形に畳む。**書かれなかった項目の既定はここだけ**。 */
export const resolveStyle = (style: StyleSpec): ResolvedStyle => ({
  theme: THEMES[style.theme ?? 'light'],
  width: style.width,
  debug: style.debug ?? true,
  stamp: style.stamp ?? false,
  // **既定は掛ける** (乗っていない足は図の上で沈黙する)。
  check: style.check ?? true,
  // **既定は敷く** — 図から寸法を読んで切るための定規の代わり。
  grid: style.grid ?? true,
});
