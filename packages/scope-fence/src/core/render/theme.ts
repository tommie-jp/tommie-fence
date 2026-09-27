import type { StyleSpec, ThemeName } from '../types.ts';

/**
 * 図の配色と寸法。**配色だけがテーマで動く** — 同じフェンスを別のテーマで出しても
 * 格子の位置も線も動かない (vna と同じ約束。色は vna の写し)。
 *
 * ch の色は**実機の 1〜4 本目の順** (黄・青・緑・紫 — AD の CH1・CH2 と同じ)。白い地に黄は
 * 読めないので、light では濃くしてある (52 の docs/76)。Math は赤 (段 3)。
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
  /** ch1〜ch4 の色。 */
  readonly channels: readonly [string, string, string, string];
  /** Math の色 (段 3)。 */
  readonly math: string;
  /** band の塗り (段 3 の notes:)。 */
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
  channels: ['#b07d00', '#1f6fb5', '#2e8b3e', '#b0368f'],
  math: '#c0392b',
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
  channels: ['#f2d21b', '#4cc3ff', '#5bd46b', '#e36ad0'],
  math: '#ff7b6b',
  band: '#35506e',
  note: '#ff7b6b',
  halo: '#1b1d21',
};

/** 白黒で刷る資料向け。**色で意味を持たせない** (理想は破線、実測は実線のまま)。 */
const MONO: Palette = {
  canvas: '#ffffff',
  frame: '#000000',
  grid: '#bdbdbd',
  label: '#3a3a3a',
  caption: '#000000',
  channels: ['#000000', '#555555', '#000000', '#555555'],
  math: '#000000',
  band: '#d0d0d0',
  note: '#000000',
  halo: '#ffffff',
};

const METRICS: Metrics = { textSize: 10, smallSize: 8.5 };

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
  stamp: style.stamp ?? false,
});

/** ch の色 (ch1 が 0)。 */
export const channelColor = (theme: Theme, index: number): string => theme.palette.channels[index % 4] ?? theme.palette.caption;
