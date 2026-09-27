/**
 * 計器の画面の単位 — 電圧・時間・角度・百分率・目盛 (`/div`) の読み書き。
 * **使い手は 2 つ見えている** (scope と spectrum。52 の docs/85 §3.7・88) ので、
 * 最初から fence-kit に置いた。
 *
 * **単位は必須。** 素の数 (`1` `0.5`) は読まずに null を返し、呼ぶ側が
 * 「1V / 500mV のように書きます」と断る。書くのは AI で、黙って別の意味に
 * 読まれると気づけない (直下の CLAUDE.md の文法の方針 1)。例外は `0` 秒だけ
 * (どの単位でも同じ値なので取り違えようがない)。
 *
 * 書き出しは WaveForms の Measurements に揃える: 電圧は有効 3 桁、時間と
 * 周波数は有効 4 桁、接頭辞で桁を寄せる (`700 mV` `1.000 ms` `100.0 Hz`)。
 * 負の数の印は ASCII の `-` (端末と試験で突き合わせやすい)。
 */

const NUMBER = String.raw`[+-]?(?:\d+(?:\.\d+)?|\.\d+)`;

const PREFIX: Readonly<Record<string, number>> = {
  '': 1, n: 1e-9, u: 1e-6, µ: 1e-6, μ: 1e-6, m: 1e-3, k: 1e3,
};

/** 振幅の書き方。**`peak` が既定** (波形発生器の Amplitude)。`dBm` は正弦の電力 (50 Ω) を peak に直した値。 */
export type AmplitudeKind = 'peak' | 'pp' | 'rms' | 'dBm';
export type Amplitude = { readonly volts: number; readonly kind: AmplitudeKind };

const VOLTS = new RegExp(`^(${NUMBER})\\s*([nuµμmk]?)V(pp|rms)?$`);
const DBM = new RegExp(`^(${NUMBER})\\s*dBm$`);

/** 50 Ω に正弦を入れたときの電力 (dBm) を、その正弦の peak (V) に。 */
const dbmToPeak = (dbm: number): number => Math.sqrt((10 ** (dbm / 10) / 1000) * 50) * Math.SQRT2;

/**
 * 電圧。`1V` `500mV` `-0.7V` `2Vpp` `0.707Vrms` `-10dBm`。素の数は null。
 * `volts` は書いた値そのもの (`pp` なら p-p の値)。`dBm` だけは peak に直して返す。
 */
export function parseVolts(text: string): Amplitude | null {
  const trimmed = text.trim();
  const dbm = DBM.exec(trimmed);
  if (dbm !== null) {
    const volts = dbmToPeak(Number(dbm[1]));
    return Number.isFinite(volts) ? { volts, kind: 'dBm' } : null;
  }
  const found = VOLTS.exec(trimmed);
  if (found === null) return null;
  const volts = Number(found[1]) * (PREFIX[found[2] ?? ''] ?? 1);
  if (!Number.isFinite(volts)) return null;
  const kind: AmplitudeKind = found[3] === 'pp' ? 'pp' : found[3] === 'rms' ? 'rms' : 'peak';
  return { volts, kind };
}

const SECOND_UNITS: Readonly<Record<string, number>> = {
  ns: 1e-9, us: 1e-6, µs: 1e-6, μs: 1e-6, ms: 1e-3, s: 1, min: 60,
};
const SECONDS = new RegExp(`^(${NUMBER})\\s*(ns|us|µs|μs|ms|s|min)$`);
const ZERO = /^[+-]?0(?:\.0+)?$/;

/** 時間 (s)。`1ms` `200us` `200µs` `1s` `1min` `0`。負も読む (カーソルは t = 0 の左にも置ける)。 */
export function parseSeconds(text: string): number | null {
  const trimmed = text.trim();
  if (ZERO.test(trimmed)) return 0;
  const found = SECONDS.exec(trimmed);
  if (found === null) return null;
  const seconds = Number(found[1]) * (SECOND_UNITS[found[2] ?? ''] ?? 1);
  return Number.isFinite(seconds) ? seconds : null;
}

const DEGREES = new RegExp(`^(${NUMBER})\\s*(?:deg|°)$`);

/** 角度 (度)。`-58deg` `90°` `45 deg`。 */
export function parseDegrees(text: string): number | null {
  const found = DEGREES.exec(text.trim());
  return found === null ? null : Number(found[1]);
}

const PERCENT = /^(\d+(?:\.\d+)?|\.\d+)\s*%$/;

/** 百分率を 0〜1 に。`25%` → 0.25。**0 と 100 は断る** (duty の両端は波にならない)。 */
export function parsePercent(text: string): number | null {
  const found = PERCENT.exec(text.trim());
  if (found === null) return null;
  const value = Number(found[1]) / 100;
  return value > 0 && value < 1 ? value : null;
}

const PER_DIV = /^(.*?)\s*\/\s*div$/;

/** 目盛 1 つぶん。`500mV/div` `1ms/div`。**`/div` の無い綴りは null** (`1ms` は時刻と紛れる)。 */
export function parsePerDiv(text: string, unit: 'V' | 's'): number | null {
  const found = PER_DIV.exec(text.trim());
  if (found === null) return null;
  const head = found[1] ?? '';
  if (unit === 's') {
    const seconds = parseSeconds(head);
    return seconds !== null && seconds > 0 ? seconds : null;
  }
  const volts = parseVolts(head);
  return volts !== null && volts.kind === 'peak' && volts.volts > 0 ? volts.volts : null;
}

const PREFIXES: Readonly<Record<number, string>> = { [-9]: 'n', [-6]: 'µ', [-3]: 'm', 0: '', 3: 'k', 6: 'M', 9: 'G' };

/**
 * 有効 `digits` 桁で、接頭辞を付けて書く (仮数は 1〜1000)。丸めで 1000 に
 * 届いたら次の接頭辞へ (`999.96 mV` → `1.00 V`)。`minExponent` より下には寄せない。
 */
function scaled(value: number, digits: number, minExponent: number): { readonly text: string; readonly prefix: string } {
  // 一番小さい接頭辞でも 0.00… になる値 (計算の誤差の 1e-16 など) は 0 と書く。
  if (!Number.isFinite(value) || Math.abs(value) < 10 ** minExponent * 1e-3) return { text: '0', prefix: '' };
  const clamp = (exponent: number): number => Math.max(minExponent, Math.min(9, exponent));
  let exponent = clamp(Math.floor(Math.log10(Math.abs(value)) / 3) * 3);
  if (Math.abs(Number((value / 10 ** exponent).toPrecision(digits))) >= 1000 && exponent < 9) exponent += 3;
  return { text: (value / 10 ** exponent).toPrecision(digits), prefix: PREFIXES[exponent] ?? '' };
}

/** 電圧の読み値。**有効 3 桁** (`2.00 V` `700 mV` `13.1 mV`)。 */
export function formatVolts(volts: number): string {
  const { text, prefix } = scaled(volts, 3, -9);
  return text === '0' ? '0 V' : `${text} ${prefix}V`;
}

/** 時間の読み値。**有効 4 桁** (`1.000 ms` `161.1 µs`)。0 は `0 s`。 */
export function formatSeconds(seconds: number): string {
  const { text, prefix } = scaled(seconds, 4, -9);
  return text === '0' ? '0 s' : `${text} ${prefix}s`;
}

/** 周波数の読み値。**有効 4 桁** (`100.0 Hz` `1.000 kHz`)。Hz より下には寄せない。 */
export function formatHertzReading(hz: number): string {
  const { text, prefix } = scaled(hz, 4, 0);
  return `${text} ${prefix}Hz`;
}

/** 角度の読み値。小数 1 桁 (`-58.0°`)。 */
export const formatDegrees = (degrees: number): string => `${degrees.toFixed(1)}°`;

/** 百分率の読み値。小数 1 桁 (`50.0 %`)。 */
export const formatPercent = (fraction: number): string => `${(fraction * 100).toFixed(1)} %`;

/** 目盛の設定。**書くときと同じ綴り** (`500mV/div` `200µs/div`)。末尾の 0 は落とす。 */
export function formatPerDiv(value: number, unit: 'V' | 's'): string {
  const { text, prefix } = scaled(value, 3, -9);
  return `${Number(text)}${prefix}${unit}/div`;
}
