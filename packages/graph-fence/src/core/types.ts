import type { THEME_NAMES } from './limits.ts';
import type { LineSpec } from './model/lines.ts';

/**
 * graph フェンスの型。**図の中に部品も基板も計器も無い** — 描くのは x の関数と点。
 * 計器の画面 (scope・spectrum・vna) と違い、軸の名前と単位は書き手が決める
 * (52 の docs/92 の決め 3)。単位が違う線は縦に積んだ別の枠に置く (vna と同じ)。
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
export const TOP_LEVEL_KEYS = ['title', 'x', 'y', 'lines', 'data', 'notes', 'style'] as const;

export type TopLevelKey = (typeof TOP_LEVEL_KEYS)[number];

export type ThemeName = (typeof THEME_NAMES)[number];

export type StyleSpec = {
  readonly theme: ThemeName | null;
  readonly width: number | null;
  readonly debug: boolean | null;
  readonly stamp: boolean | null;
};

/**
 * 軸の 1 行。`x: 周波数 Hz log 2k..32k` / `y: 電流 mA 0..30`。
 * 名前は省ける (単位だけの軸)。範囲を省けば値から決める。
 */
export type AxisSpec = {
  readonly name: string | null;
  readonly unit: string;
  readonly log: boolean;
  readonly range: readonly [number, number] | null;
  readonly line: number | null;
};

/** 注釈。**番地は軸の値** (x、y は単位つき — 単位でどの枠かが決まる)。 */
export type NoteSpec =
  | { readonly kind: 'mark'; readonly x: number; readonly line: number | null }
  | { readonly kind: 'level'; readonly y: number; readonly unit: string | null; readonly line: number | null }
  | { readonly kind: 'band'; readonly from: number; readonly to: number; readonly text: string | null; readonly line: number | null }
  | { readonly kind: 'text'; readonly x: number; readonly y: number; readonly unit: string | null; readonly text: string; readonly line: number | null }
  | { readonly kind: 'peak'; readonly line: number | null }
  | { readonly kind: 'source'; readonly line: number | null };

export type FenceDocument = {
  readonly title: string | null;
  /** 書かなければ null (`x 0..1` で描き、お知らせで言う)。 */
  readonly x: AxisSpec | null;
  /** 単位ごとの縦軸 (書いた物だけ)。 */
  readonly y: readonly AxisSpec[];
  /** 読めた線 (書いた順)。 */
  readonly lines: readonly LineSpec[];
  /** 測った値のファイル名 (`.md` の隣)。 */
  readonly data: { readonly name: string; readonly label: string; readonly line: number | null } | null;
  readonly notes: readonly NoteSpec[];
  readonly style: StyleSpec;
  /** 書いてあった一番外側のキー (読めなかったものも)。「無いので既定で」と言うかを決める。 */
  readonly keys: readonly string[];
};
