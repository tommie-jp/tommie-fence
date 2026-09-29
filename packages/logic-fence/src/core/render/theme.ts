import type { StyleSpec, ThemeName } from '../types.ts';

/**
 * 図の配色と寸法。**配色だけがテーマで動く** — 同じフェンスを別のテーマで出しても
 * 格子の位置も線も動かない (vna・scope・spectrum と同じ約束)。
 *
 * レーンは緑、バスは青、読み下しは青緑 (WaveForms の Logic は行ごとに色を持てるが、
 * 種類で 3 色に絞ると本文の「バスの値」を読む目が迷わない)。カーソルは X1 が黄、X2 が紫
 * (mono では X2 を破線で分ける)。トリガの印は赤系。白い地に黄は読めないので、light は濃くしてある。
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
  /** 1 ビットのレーンの線。 */
  readonly lane: string;
  /** バスの箱。 */
  readonly bus: string;
  /** 読み下しの箱。 */
  readonly decode: string;
  /** カーソル X1・X2。 */
  readonly cursors: readonly [string, string];
  /** トリガの印。誤りのあるフレームにも使う。 */
  readonly trigger: string;
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
  lane: '#2e8b3e',
  bus: '#1f6fb5',
  decode: '#0e7c86',
  cursors: ['#b07d00', '#7a4bb0'],
  trigger: '#c0392b',
  halo: '#ffffff',
};

const DARK: Palette = {
  canvas: '#1b1d21',
  frame: '#8a939c',
  grid: '#383e45',
  label: '#9aa7b0',
  caption: '#e3e8ec',
  lane: '#5bd46b',
  bus: '#4cc3ff',
  decode: '#4fd1c5',
  cursors: ['#f2d21b', '#c792ea'],
  trigger: '#ff7b6b',
  halo: '#1b1d21',
};

/** 白黒で刷る資料向け。**色で意味を持たせない** (X2 は破線で分ける)。 */
const MONO: Palette = {
  canvas: '#ffffff',
  frame: '#000000',
  grid: '#bdbdbd',
  label: '#3a3a3a',
  caption: '#000000',
  lane: '#000000',
  bus: '#000000',
  decode: '#333333',
  cursors: ['#000000', '#555555'],
  trigger: '#000000',
  halo: '#ffffff',
};

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
