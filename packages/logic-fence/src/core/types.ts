import type { THEME_NAMES } from './limits.ts';
import type { DecodeSpec } from './model/decode.ts';
import type { DeviceName } from './model/device.ts';
import type { Radix } from './model/radix.ts';
import type { SignalSpec } from './model/signalSpec.ts';

/**
 * logic フェンスの型。**図の中に部品も板も無い** — 描くのは信号の高低 (レーン) と、
 * 束ねたバスの値、時間軸、カーソル、トリガの印。WaveForms (Analog Discovery 3) の
 * Logic と、ほかのロジックアナライザの画面を写す。
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
  'device', 'title', 'time', 'window', 'start', 'sample', 'signals', 'buses', 'decode', 'cursors', 'trigger', 'style',
] as const;

export type TopLevelKey = (typeof TOP_LEVEL_KEYS)[number];

export type ThemeName = (typeof THEME_NAMES)[number];

export type StyleSpec = {
  readonly theme: ThemeName | null;
  readonly width: number | null;
  readonly debug: boolean | null;
  readonly stamp: boolean | null;
};

/** 読んだ値と、書いてあった行 (お知らせとエラーの行番号に使う)。 */
export type Located<T> = { readonly value: T; readonly line: number | null };

/** `dio3` か `dio1..dio4`。 */
export type DioRange = { readonly from: number; readonly to: number };

/** `signals:` の 1 行。 */
export type SignalEntry = {
  readonly name: string;
  readonly line: number | null;
  readonly dio: DioRange | null;
  readonly spec: SignalSpec;
};

/** `buses:` の 1 行。`bits` は MSB が先。 */
export type BusEntry = {
  readonly name: string;
  readonly line: number | null;
  readonly bits: readonly string[];
  readonly radix: Radix;
};

export type DecodeEntry = { readonly name: string; readonly line: number | null; readonly spec: DecodeSpec };

export type CursorSpec = { readonly time: number; readonly line: number | null };

export type TriggerSpec = {
  readonly lane: string;
  readonly edge: 'rising' | 'falling';
  /** `at` を書かなかったときは null (窓の中で最初の該当する edge)。 */
  readonly at: number | null;
  readonly line: number | null;
};

/** 時間軸の書き方。`time:` は 1 目盛、`window:` は窓の全部 (目盛は 10 で固定)。 */
export type TimeSpec = { readonly perDiv: number; readonly written: 'time' | 'window' };

export type FenceDocument = {
  /** 書かれなかった・読めなかったときは null (**既定を作らない** — 標本化と本数の検査が変わる)。 */
  readonly device: DeviceName | null;
  readonly title: string | null;
  readonly time: Located<TimeSpec> | null;
  /** 窓の左端の時刻 (s)。書かなければ 0。 */
  readonly start: Located<number> | null;
  /** 標本化 (Hz)。書かなければ null (標本化の検査をしない)。 */
  readonly sample: Located<number> | null;
  readonly signals: readonly SignalEntry[];
  readonly buses: readonly BusEntry[];
  readonly decode: readonly DecodeEntry[];
  readonly cursors: readonly CursorSpec[];
  readonly trigger: TriggerSpec | null;
  readonly style: StyleSpec;
  /** 書いてあった一番外側のキー (読めなかったものも)。 */
  readonly keys: readonly string[];
};
