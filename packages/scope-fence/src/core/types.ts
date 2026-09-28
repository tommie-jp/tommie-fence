import type { THEME_NAMES } from './limits.ts';
import type { ChannelName, ChannelSpec, TraceName } from './model/channel.ts';
import type { Expr } from './model/expr.ts';
import type { QuantityUnit } from './model/quantity.ts';
import type { MeasureName } from './model/measure.ts';
import type { TriggerEdge } from './model/screen.ts';

/**
 * scope フェンスの型。**図の中に部品も板も無い** — 描くのは時間の関数 (電圧)。
 * vna との違いは、枠を単位で分けず **1 つの格子に ch を重ねる**こと (52 の docs/81 決め 4)。
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
export const TOP_LEVEL_KEYS = [
  'view', 'title', 'time', 'trigger', 'ch1', 'ch2', 'ch3', 'ch4', 'math', 'xy', 'data', 'cursors', 'measure', 'notes', 'style',
] as const;

export type TopLevelKey = (typeof TOP_LEVEL_KEYS)[number];

export type ThemeName = (typeof THEME_NAMES)[number];

export type StyleSpec = {
  readonly theme: ThemeName | null;
  readonly width: number | null;
  readonly debug: boolean | null;
  readonly stamp: boolean | null;
};

/** 横軸の設定。`time: 1ms/div`。 */
export type TimeSpec = { readonly perDiv: number; readonly line: number | null };

/** `trigger: ch1 rising 1V`。水準が null なら波形の中央。 */
export type TriggerSpec = {
  readonly source: ChannelName;
  readonly edge: TriggerEdge;
  readonly level: number | null;
  readonly line: number | null;
};

/** カーソル (時刻 s)。 */
export type CursorSpec = { readonly t: number; readonly line: number | null };

/**
 * Math (`math: ch1 * ch2 / 10`)。**ch と同じ扱いの 5 本目** — 色は 5 本目、range: と position: も書ける。
 * 単位は書き手が言う (`unit:`。書かなければ V)。
 */
export type MathSpec = {
  readonly expr: Expr;
  /** 書き手の言った単位 (書かなければ V。式の次元と合わなければ読みのほうでお知らせ)。 */
  readonly unit: QuantityUnit;
  readonly range: number | null;
  readonly position: number | null;
  readonly line: number | null;
};

/**
 * 注釈 (`notes:`)。番地は「時刻 電圧」。**電圧は `channel` の V/div と基準で置く**
 * (書かなければ ch1)。band は時刻の帯 (縦は格子いっぱい)。
 */
export type NoteSpec =
  | { readonly kind: 'text'; readonly channel: ChannelName; readonly t: number; readonly volts: number; readonly text: string; readonly line: number | null }
  | { readonly kind: 'mark'; readonly channel: ChannelName; readonly t: number; readonly volts: number; readonly line: number | null }
  | { readonly kind: 'band'; readonly from: number; readonly to: number; readonly text: string | null; readonly line: number | null }
  | { readonly kind: 'source'; readonly line: number | null };

/** XY の軸 (`xy: ch1 math`)。書かなければ横 ch1・縦 ch2 (line は null)。 */
export type XySpec = { readonly x: TraceName; readonly y: TraceName; readonly line: number | null };

export type FenceDocument = {
  /** 画面の種類。time (時間波形) か xy (リサージュ・V–I の曲線)。 */
  readonly view: 'time' | 'xy';
  readonly title: string | null;
  /** 書かなければ null (一番遅い波から決める)。 */
  readonly time: TimeSpec | null;
  /** 書かなければ null (最初の ch の立ち上がり、水準は中央)。 */
  readonly trigger: TriggerSpec | null;
  /** 読めた ch (ch1 → ch4 の順)。 */
  readonly channels: readonly ChannelSpec[];
  /** 読めた Math (書かなければ null)。 */
  readonly math: MathSpec | null;
  /** XY の軸。view: xy のときだけ (time なら null)。 */
  readonly xy: XySpec | null;
  /** 測った値のファイル名 (`.md` の隣)。 */
  readonly data: { readonly name: string; readonly line: number | null } | null;
  readonly cursors: readonly CursorSpec[];
  /** 書かなければ null (既定の vpp と freq)。 */
  readonly measures: readonly MeasureName[] | null;
  /** 注釈 (時間の画面だけ。XY では断って空)。 */
  readonly notes: readonly NoteSpec[];
  readonly style: StyleSpec;
  /** 書いてあった一番外側のキー (読めなかったものも)。「無いので既定で」と言うかを決める。 */
  readonly keys: readonly string[];
};
