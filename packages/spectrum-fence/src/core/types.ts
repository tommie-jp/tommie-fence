import type { THEME_NAMES } from './limits.ts';
import type { WaveSpec, WindowName } from 'fence-kit';
import type { DeviceKind, DeviceName, LevelUnit } from './model/device.ts';
import type { HoldEntry } from './model/hold.ts';
import type { MarkerSpec } from './model/markers.ts';
import type { SweepText } from './model/sweep.ts';
import type { Level } from './parser/values.ts';

/**
 * spectrum フェンスの型。**図の中に部品も基板も無い** — 描くのはスペクトル (周波数ごとの
 * レベル)。計器の型 (FFT 型か掃引型か) は `device:` が決め、キーの意味は型で変わらない
 * (片方の型にしか無いキーは、もう片方では断る。52 の docs/88)。
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
  'device', 'title', 'sweep', 'center', 'span', 'points', 'samples', 'window', 'rbw', 'atten', 'lna',
  'ref', 'scale', 'unit', 'floor', 'signal', 'hold', 'data', 'markers', 'notes', 'style',
] as const;

export type TopLevelKey = (typeof TOP_LEVEL_KEYS)[number];

/**
 * **キーごとに、どの型の計器で書けるか。** 片方にしか無いキーは、もう片方の機種では
 * 断って理由を言う (「ad2 では rbw: は書けません (…)」)。`TOP_LEVEL_KEYS` と鍵が
 * 揃っていることは `types.test.ts` が見る (足し忘れると型の検査を素通りする)。
 */
export const KEY_KINDS: Readonly<Record<TopLevelKey, readonly DeviceKind[]>> = {
  device: ['fft', 'swept'],
  title: ['fft', 'swept'],
  sweep: ['fft', 'swept'],
  center: ['fft', 'swept'],
  span: ['fft', 'swept'],
  points: ['swept'],
  samples: ['fft'],
  window: ['fft'],
  rbw: ['swept'],
  atten: ['swept'],
  lna: ['swept'],
  ref: ['fft', 'swept'],
  scale: ['fft', 'swept'],
  unit: ['fft', 'swept'],
  floor: ['fft', 'swept'],
  signal: ['fft', 'swept'],
  hold: ['fft', 'swept'],
  data: ['fft', 'swept'],
  markers: ['fft', 'swept'],
  notes: ['fft', 'swept'],
  style: ['fft', 'swept'],
};

export type ThemeName = (typeof THEME_NAMES)[number];

export type StyleSpec = {
  readonly theme: ThemeName | null;
  readonly width: number | null;
  readonly debug: boolean | null;
  readonly stamp: boolean | null;
};

/** 読んだ値と、書いてあった行 (お知らせとエラーの行番号に使う)。 */
export type Located<T> = { readonly value: T; readonly line: number | null };

export type FenceDocument = {
  /** 書かれなかった・読めなかったときは null (**既定を作らない** — 計算の道が変わる)。 */
  readonly device: DeviceName | null;
  readonly title: string | null;
  /** `sweep:` か `center:` + `span:`。書かなければ null (機種の範囲)。 */
  readonly sweep: Located<SweepText & { readonly centered: boolean }> | null;
  /** `points:` (掃引型)。 */
  readonly points: Located<number> | null;
  readonly samples: Located<number> | null;
  readonly window: Located<WindowName> | null;
  readonly rbw: Located<number> | null;
  readonly atten: Located<number> | null;
  readonly lna: Located<boolean> | null;
  readonly ref: Located<Level> | null;
  readonly scale: Located<number> | null;
  readonly unit: Located<LevelUnit> | null;
  readonly floor: Located<Level> | null;
  /** 読めた波 (和を取る)。 */
  readonly signal: readonly Located<WaveSpec>[];
  /** MAX HOLD で積んだ掃引 (`hold:`)。無ければ空。 */
  readonly hold: readonly HoldEntry[];
  readonly markers: readonly MarkerSpec[];
  /** 重ねる値のファイル名 (`.md` の隣) と、凡例・読み値の見出しに出す名前 (書かなければ `実測`)。 */
  readonly data: { readonly value: string; readonly label: string; readonly line: number | null } | null;
  readonly style: StyleSpec;
  /** 書いてあった一番外側のキー (読めなかったものも)。「無いので既定で」と言うかを決める。 */
  readonly keys: readonly string[];
};
