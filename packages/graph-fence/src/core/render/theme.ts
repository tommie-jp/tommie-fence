import type { StyleSpec, ThemeName } from '../types.ts';

/**
 * 図の配色と寸法。**配色だけがテーマで動く** — 同じフェンスを別のテーマで出しても
 * 枠の位置も線も動かない (scope・vna と同じ約束。色は scope の写し)。
 *
 * 線の色は書いた順に 4 色を回す (5 本目からは同じ色が戻る。4 本を超えると見分けにくい —
 * readable-graph #7)。白い地に黄は読めないので、light では濃くしてある (52 の docs/76)。
 */
export type Palette = {
  /** 図の地。null なら塗らない (貼った先の背景が透ける)。 */
  readonly canvas: string | null;
  /** 格子の枠。 */
  readonly frame: string;
  /** 格子の線。 */
  readonly grid: string;
  /** 目盛の字。 */
  readonly label: string;
  /** 題・見出し・読み値。 */
  readonly caption: string;
  /** 線の色 (書いた順)。 */
  readonly lines: readonly [string, string, string, string];
  /** band の塗り。 */
  readonly band: string;
  /** 注釈の字と印。 */
  readonly note: string;
  /** 線の上の字の縁取り。 */
  readonly halo: string;
};

export type Metrics = {
  readonly textSize: number;
  /** 目盛と読み値の字。 */
  readonly smallSize: number;
};

export type Theme = { readonly palette: Palette; readonly metrics: Metrics };

const LIGHT: Palette = {
  canvas: null,
  frame: '#5c6670',
  grid: '#c9d0d6',
  label: '#5f6a74',
  caption: '#2c3339',
  lines: ['#b07d00', '#1f6fb5', '#2e8b3e', '#b0368f'],
  band: '#8fb3d9',
  note: '#c0392b',
  halo: '#ffffff',
};

const DARK: Palette = {
  canvas: '#1b1d21',
  frame: '#8a939c',
  grid: '#383e45',
  label: '#9aa7b0',
  caption: '#e3e8ec',
  lines: ['#f2d21b', '#4cc3ff', '#5bd46b', '#e36ad0'],
  band: '#35506e',
  note: '#ff7b6b',
  halo: '#1b1d21',
};

/** 白黒で刷る資料向け。**色で意味を持たせない** (理想は線、実測は ○ のまま)。 */
const MONO: Palette = {
  canvas: '#ffffff',
  frame: '#000000',
  grid: '#bdbdbd',
  label: '#3a3a3a',
  caption: '#000000',
  lines: ['#000000', '#555555', '#000000', '#555555'],
  band: '#d0d0d0',
  note: '#000000',
  halo: '#ffffff',
};

/**
 * 字の大きさ。**図を等倍で見て本文と同じくらい** (12 px。scope と同じ) — 幅 400 px の枠を
 * 縮めずに貼るので、字を小さくすると読めない。凡例・目盛・名札・読み値は同じ大きさ。
 */
const METRICS: Metrics = { textSize: 12, smallSize: 12 };

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
};

/** `style:` を描く側の形に畳む。**書かれなかった項目の既定はここだけ**。 */
export const resolveStyle = (style: StyleSpec): ResolvedStyle => ({
  theme: THEMES[style.theme ?? 'light'],
  width: style.width,
  debug: style.debug ?? true,
  stamp: style.stamp ?? true,
});

/** 線の色 (書いた順の 0 始まり)。 */
export const lineColor = (theme: Theme, index: number): string => theme.palette.lines[index % 4] ?? theme.palette.caption;
