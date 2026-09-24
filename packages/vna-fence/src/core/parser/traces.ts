import { safeToken } from '../errors.ts';
import { FORMATS, THROUGH_FORMATS } from '../types.ts';
import type { TraceFormat, TraceSpec } from '../types.ts';
import { fail, ok, wordsOf } from './result.ts';
import type { LineResult } from './result.ts';
import { parseNumber } from './values.ts';

/** TDR の既定の速度係数 (ポリエチレンの同軸)。 */
export const DEFAULT_VF = 0.66;

/** `S21 logmag` / `S11 smith` / `S11 tdr vf 0.66`。 */
export function parseTraceLine(text: string): LineResult<Omit<TraceSpec, 'line'>> {
  const words = wordsOf(text);
  const [paramWord, formatWord, ...rest] = words;
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
  if (rest.length > 0) {
    if (format !== 'tdr' || rest[0] !== 'vf' || rest.length !== 2) {
      return fail(`${safeToken(rest.join(' '))} が読めません (後ろに書けるのは tdr の vf 0.66 だけ)`, rest[0]);
    }
    const read = parseNumber(rest[1] ?? '');
    if (read === null || read < 0.1 || read > 1) return fail('vf (速度係数) は 0.1〜1 で書きます', rest[1]);
    vf = read;
  }
  return ok({ param, format: format as TraceFormat, vf });
}
