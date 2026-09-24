import type { THEME_NAMES } from './limits.ts';
import type { DeviceName } from './model/device.ts';
import type { DutElement } from './model/dut.ts';
import type { Param } from './model/sparams.ts';
import type { Sweep } from './model/sweep.ts';

/**
 * vna フェンスの型。**板の 3 つと分けてある理由**: 図の中に部品も板も無い。
 * 描くのは周波数の関数 (S パラメータ) で、ネットリストも ERC もマップも持たない
 * (52 の docs/75・76)。
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
  /** お知らせ (読めているが思ったとおりに出ない)。 */
  readonly notice?: boolean;
};

/** フェンスの一番外側に書けるキー。知らないキーを名指すのにも使う。 */
export const TOP_LEVEL_KEYS = ['device', 'sweep', 'title', 'dut', 'data', 'traces', 'markers', 'notes', 'style'] as const;

export type TopLevelKey = (typeof TOP_LEVEL_KEYS)[number];

/**
 * トレースの形式。**名前は NanoVNA のメニューと同じ** (小文字で書く)。
 * `r` `x` `z` は S11 から出したインピーダンスの実部・虚部・大きさ。
 */
export const FORMATS = ['logmag', 'phase', 'delay', 'smith', 'polar', 'swr', 'linear', 'r', 'x', 'z', 'tdr'] as const;
export type TraceFormat = (typeof FORMATS)[number];

/** S21 で描ける形式。残りは反射 (S11) の見方。 */
export const THROUGH_FORMATS: readonly TraceFormat[] = ['logmag', 'phase', 'delay', 'polar', 'linear'];

export type TraceSpec = {
  readonly param: Param;
  readonly format: TraceFormat;
  /** TDR の速度係数。tdr 以外は null。 */
  readonly vf: number | null;
  readonly line: number | null;
};

export type MarkerSpec = { readonly f: number; readonly line: number | null };

/** 注釈の値の単位。**どの枠に置くかを決める**。 */
export type NoteUnit = 'dB' | 'deg' | 'ns' | 'ohm' | 'none';

export type NoteSpec =
  | { readonly kind: 'text'; readonly f: number; readonly value: number; readonly unit: NoteUnit; readonly text: string; readonly line: number | null }
  | { readonly kind: 'mark'; readonly f: number; readonly value: number; readonly unit: NoteUnit; readonly line: number | null }
  | { readonly kind: 'band'; readonly from: number; readonly to: number; readonly text: string | null; readonly line: number | null }
  | { readonly kind: 'source'; readonly line: number | null };

export type ThemeName = (typeof THEME_NAMES)[number];

export type StyleSpec = {
  readonly theme: ThemeName | null;
  readonly width: number | null;
  readonly debug: boolean | null;
  readonly stamp: boolean | null;
};

export type FenceDocument = {
  readonly device: DeviceName;
  readonly sweep: Sweep;
  readonly title: string | null;
  readonly dut: readonly DutElement[];
  /** 測った値のファイル名 (`.md` の隣)。 */
  readonly data: { readonly name: string; readonly line: number | null } | null;
  readonly traces: readonly TraceSpec[];
  /** `traces:` を書いたか (書かなければ既定の 3 本)。 */
  readonly tracesWritten: boolean;
  readonly markers: readonly MarkerSpec[];
  readonly notes: readonly NoteSpec[];
  readonly style: StyleSpec;
};
