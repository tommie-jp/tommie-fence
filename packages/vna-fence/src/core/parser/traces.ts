import { safeToken } from '../errors.ts';
import { FORMATS, THROUGH_FORMATS } from '../types.ts';
import type { TraceFormat, TraceSpec } from '../types.ts';
import { fail, ok, wordsOf } from './result.ts';
import type { LineResult } from './result.ts';
import { parseNumber } from './values.ts';

/** TDR の既定の速度係数 (ポリエチレンの同軸)。 */
export const DEFAULT_VF = 0.66;

/** 尺度の書き方 (形式ごとの単位と例)。実機の SCALE と同じ 1 目盛あたりの量。 */
const SCALE_FORMS: Readonly<Partial<Record<TraceFormat, { readonly example: string; readonly pattern: RegExp }>>> = {
  logmag: { example: 'S21 logmag 1dB', pattern: /^(\d+(?:\.\d+)?|\.\d+)dB$/i },
  phase: { example: 'S21 phase 5deg', pattern: /^(\d+(?:\.\d+)?|\.\d+)(?:deg|°)$/i },
  delay: { example: 'S21 delay 1ns', pattern: /^(\d+(?:\.\d+)?|\.\d+)(ps|ns|us|µs|μs)$/i },
  linear: { example: 'S11 linear 0.1', pattern: /^(\d+(?:\.\d+)?|\.\d+)$/ },
  swr: { example: 'S11 swr 0.5', pattern: /^(\d+(?:\.\d+)?|\.\d+)$/ },
};

/** 尺度の語を読む。値は dB・度・ns (delay は ns に直す)・単位の無い数。 */
function parseScale(format: TraceFormat, rest: readonly string[]): LineResult<number> {
  const form = SCALE_FORMS[format];
  if (form === undefined) {
    return fail(`${safeToken(rest.join(' '))} が読めません (縦の尺度を書けるのは ${Object.keys(SCALE_FORMS).join(' / ')} だけ)`, rest[0]);
  }
  const word = rest[0] ?? '';
  if (rest.length !== 1) return fail(`尺度は 1 語で書きます (例: ${form.example})`, rest[1]);
  if (/\/(?:div|目盛)$/i.test(word)) return fail(`/div は付けません。1 目盛あたりの量だけ書きます (例: ${form.example})`, word);
  const found = form.pattern.exec(word);
  if (found === null) {
    return fail(`尺度が読めません: ${safeToken(word)} (${format === 'linear' || format === 'swr' ? '1 目盛あたりの数' : '単位つきで 1 目盛あたりの量'}を書きます。例: ${form.example})`, word);
  }
  const multiplier = found[2] === undefined ? 1 : { ps: 1e-3, ns: 1, us: 1e3, µs: 1e3, μs: 1e3 }[found[2].toLowerCase()] ?? 1;
  const value = Number(found[1]) * multiplier;
  if (!(value > 0) || value > 1e6) return fail(`尺度は 0 より大きく書きます (例: ${form.example})`, word);
  return ok(value);
}

/** phase の中心の書き方 (`at 90deg`)。度は全角の − も受ける。 */
const CENTER_EXAMPLE = 'S21 phase 1deg at 90deg';
const CENTER_PATTERN = /^([+\-−]?(?:\d+(?:\.\d+)?|\.\d+))(?:deg|°)$/i;
/** 中心に書ける範囲 (度)。位相は ±180° で折り返す。 */
const CENTER_LIMIT = 180;

/** `at` の後ろの中心を読む。`at` は phase の尺度の後ろだけ。 */
function parseCenter(format: TraceFormat, before: readonly string[], after: readonly string[]): LineResult<number> {
  if (format !== 'phase') {
    return fail(`at を書けるのは phase の尺度の後ろだけです (例: ${CENTER_EXAMPLE})`, 'at');
  }
  if (before.length === 0) return fail(`at の前に尺度を書きます (例: ${CENTER_EXAMPLE})`, 'at');
  const word = after[0] ?? '';
  if (after.length !== 1) return fail(`at の後ろに中心の角度を単位つきで 1 語書きます (例: ${CENTER_EXAMPLE})`, after[1] ?? 'at');
  const found = CENTER_PATTERN.exec(word);
  if (found === null) return fail(`中心が読めません: ${safeToken(word)} (単位つきの角度で書きます。例: ${CENTER_EXAMPLE})`, word);
  const value = Number((found[1] ?? '').replace('−', '-'));
  if (Math.abs(value) > CENTER_LIMIT) return fail(`中心は −180°〜180° で書きます (例: ${CENTER_EXAMPLE})`, word);
  return ok(value);
}

/** `S21 logmag` / `S11 smith` / `S11 tdr vf 0.66`。 */
export function parseTraceLine(text: string): LineResult<Omit<TraceSpec, 'line'>> {
  const words = wordsOf(text);
  const [paramWord, formatWord, ...tail] = words;
  let rest = tail;
  const param = (paramWord ?? '').toUpperCase();
  if (param === 'S22' || param === 'S12') {
    return fail(`${param} は実機では測りません (治具を裏返して S11 / S21 で測ります)`, paramWord);
  }
  if (param !== 'S11' && param !== 'S21') {
    return fail('トレースは「S21 logmag」のように、S11 か S21 と形式で書きます', paramWord);
  }
  const format = (formatWord ?? '').toLowerCase();
  if (!(FORMATS as readonly string[]).includes(format)) {
    return fail(`知らない形式です: ${safeToken(formatWord ?? '')} (${FORMATS.join(' / ')})`, formatWord);
  }
  if (param === 'S21' && !THROUGH_FORMATS.includes(format as TraceFormat)) {
    return fail(`S21 の ${format} は描きません (${format} は反射の見方なので S11 で。S21 は ${THROUGH_FORMATS.join(' / ')})`, formatWord);
  }
  let vf: number | null = format === 'tdr' ? DEFAULT_VF : null;
  let scale: number | null = null;
  let center: number | null = null;
  const atIndex = rest.findIndex((word) => word.toLowerCase() === 'at');
  if (atIndex !== -1) {
    const read = parseCenter(format as TraceFormat, rest.slice(0, atIndex), rest.slice(atIndex + 1));
    if (!read.ok) return read;
    center = read.value;
    rest = rest.slice(0, atIndex);
  }
  if (rest[0] === 'vf' && format !== 'tdr') {
    return fail(`${safeToken(rest.join(' '))} が読めません (vf を書けるのは tdr だけ。tdr の vf 0.66)`, rest[0]);
  }
  if (rest.length > 0 && format !== 'tdr') {
    const read = parseScale(format as TraceFormat, rest);
    if (!read.ok) return read;
    scale = read.value;
  } else if (rest.length > 0) {
    if (format !== 'tdr' || rest[0] !== 'vf' || rest.length !== 2) {
      return fail(`${safeToken(rest.join(' '))} が読めません (後ろに書けるのは tdr の vf 0.66 だけ)`, rest[0]);
    }
    const read = parseNumber(rest[1] ?? '');
    if (read === null || read < 0.1 || read > 1) return fail('vf (速度係数) は 0.1〜1 で書きます', rest[1]);
    vf = read;
  }
  return ok({ param, format: format as TraceFormat, vf, scale, center });
}
