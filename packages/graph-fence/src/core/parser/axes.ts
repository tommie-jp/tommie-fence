import { dropInvisible, safeToken } from '../errors.ts';
import { LIMITS, clampText } from '../limits.ts';
import { parseNumber, parseQuantity } from '../model/quantity.ts';
import type { AxisSpec } from '../types.ts';
import { fail, ok, wordsOf } from './result.ts';
import type { LineResult } from './result.ts';

/**
 * 軸の 1 行。**後ろから読む** — 最後の語が `a..b` なら範囲、その前が `log` なら対数、
 * その前が単位、残りが名前 (`x: 周波数 Hz log 2k..32k`、`y: mA 0..30`)。
 * 範囲の区切りは `..` (dB・deg・℃ は負の値を持つので `-` では切れない。52 の docs/96)。
 */

const RANGE_HINT = '範囲は 2k..32k / -40..0 のように .. で区切ります';

/** `a-b` の形 (vna の掃引の書き方)。範囲の書き間違いとして名指す。 */
const DASH_RANGE = /^[+-]?[\d.]+[pnuµμmkMGT]?[A-Za-zΩ°%℃]*-[+-]?[\d.]+/u;

const isRangeWord = (word: string): boolean => word.includes('..');

/** `2k..32k` / `-40dB..0dB`。単位は軸の単位なら付けてよい。 */
export function parseRange(text: string, unit: string, log: boolean): LineResult<readonly [number, number]> {
  const parts = text.split('..');
  if (parts.length !== 2) return fail(RANGE_HINT, text);
  const [from, to] = parts.map((part) => parseQuantity(part, unit));
  if (from === undefined || to === undefined) return fail(RANGE_HINT, text);
  if (!from.ok) return fail(`範囲の始めが読めません: ${safeToken(parts[0] ?? '')} (${from.reason})`, text);
  if (!to.ok) return fail(`範囲の終わりが読めません: ${safeToken(parts[1] ?? '')} (${to.reason})`, text);
  if (to.value <= from.value) return fail('範囲の終わりは始めより大きくします (2k..32k)', text);
  if (Math.max(Math.abs(from.value), Math.abs(to.value)) > LIMITS.valueMax) return fail('範囲が大きすぎます', text);
  if (log) {
    if (from.value <= 0) return fail('対数の軸は 0 より大きい値から始めます (1u..10 のように)', text);
    if (to.value / from.value > LIMITS.logRatio) return fail('対数の軸は 12 桁までです', text);
  }
  return ok([from.value, to.value] as const);
}

/** 単位に使える語か。**数や範囲は単位にしない** (`x: 0..10` の書き忘れを名指すため)。 */
const looksLikeUnit = (word: string): boolean =>
  word !== 'log' && parseNumber(word) === null && !isRangeWord(word) && !/^[+-]?\d/.test(word);

/**
 * `x:` / `y:` の中身。`which` はエラー文の頭 (`x:` か `y:`)。
 * 名前と単位の長さは切り詰めて持つ (図に刷る字)。
 */
export function parseAxis(text: string, which: 'x' | 'y'): LineResult<Omit<AxisSpec, 'line'>> {
  const example = which === 'x' ? 'x: 周波数 Hz log 2k..32k' : 'y: 電流 mA 0..30';
  // 見えない字 (bidi・幅 0) は名札に刷る前に落とす。
  const words = wordsOf(dropInvisible(text));
  if (words.length === 0) return fail(`${which}: には「名前 単位 [log] [範囲]」を書きます (${example})`);
  let rest = [...words];
  let rangeText: string | null = null;
  const last = rest[rest.length - 1] ?? '';
  if (isRangeWord(last)) {
    rangeText = last;
    rest = rest.slice(0, -1);
  } else if (DASH_RANGE.test(last) && !looksLikeUnit(last)) {
    return fail(RANGE_HINT, last);
  }
  let log = false;
  if (rest[rest.length - 1] === 'log') {
    log = true;
    rest = rest.slice(0, -1);
  }
  const unit = rest[rest.length - 1];
  if (unit === undefined || !looksLikeUnit(unit)) {
    return fail(`${which}: に単位がありません (${example}。単位の無い量は 倍 のように語で書きます)`, unit ?? text);
  }
  if (rest.includes('log')) return fail(`log は単位の後ろ、範囲の前に書きます (${example})`, 'log');
  const nameWords = rest.slice(0, -1);
  const name = nameWords.length === 0 ? null : clampText(nameWords.join(' '), LIMITS.nameLength);
  // `°` は `deg` と同じ単位 (線のキーと同じ扱い)。
  const shownUnit = clampText(unit === '°' ? 'deg' : unit, LIMITS.nameLength);
  if (rangeText === null) return ok({ name, unit: shownUnit, log, range: null });
  const range = parseRange(rangeText, unit, log);
  if (!range.ok) return range;
  return ok({ name, unit: shownUnit, log, range: range.value });
}
