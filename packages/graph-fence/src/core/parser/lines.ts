import { dropInvisible, safeToken } from '../errors.ts';
import { LIMITS, clampText } from '../limits.ts';
import { parseExpr } from '../model/expr.ts';
import type { Expr } from '../model/expr.ts';
import type { Point } from '../model/lines.ts';
import { parseNumber, parseQuantity } from '../model/quantity.ts';
import { fail, ok, wordsOf } from './result.ts';
import type { LineResult } from './result.ts';

/**
 * `lines:` の 1 本。**キーの最後の語が単位** (`出力 50Ω mA:`、`利得 dB:`)、その前が名前。
 * 値が字なら式、並びなら点列 (1 行 1 点の `- 2k 0.38`。点ごとに行番号が付く)。
 */

const KEY_HINT = '線は「名前 単位:」の形で書きます (電流 mA: … / 利得 dB: …)';

/** 線のキー。名前と単位 (どちらも刷る字)。 */
export function parseLineKey(key: string): LineResult<{ readonly name: string; readonly unit: string }> {
  // 見えない字 (bidi・幅 0) は凡例に刷る前に落とす。
  const words = wordsOf(dropInvisible(key));
  if (words.length < 2) return fail(KEY_HINT, key || undefined);
  const unit = words[words.length - 1] ?? '';
  if (parseNumber(unit) !== null || /^[+-]?\d/.test(unit)) return fail(`線の単位が数になっています: ${safeToken(unit)} (${KEY_HINT})`, unit);
  // `°` は `deg` と同じ単位 (枠を分ける鍵を 1 つにする。注釈の `-45°` と当たるように)。
  return ok({ name: clampText(words.slice(0, -1).join(' '), LIMITS.nameLength), unit: clampText(unit === '°' ? 'deg' : unit, LIMITS.nameLength) });
}

/** 式の線。読めなければ理由と綴り。 */
export function parseLineExpr(text: string): LineResult<Expr> {
  const read = parseExpr(text);
  if (!read.ok) return fail(`式が読めません: ${read.reason}`, read.token);
  return ok(read.expr);
}

const POINT_HINT = '点は「- x y」の 1 行で書きます (- 2k 0.38)';

/** 点列の 1 点。**単位は軸と同じなら付けてよい** (`2kHz 0.38mA`)。 */
export function parsePoint(text: string, xUnit: string, yUnit: string): LineResult<Point> {
  const words = wordsOf(text);
  if (words.length !== 2) return fail(POINT_HINT, text || undefined);
  const x = parseQuantity(words[0] ?? '', xUnit);
  if (!x.ok) return fail(`点の x が読めません: ${safeToken(words[0] ?? '')} (${x.reason})`, words[0]);
  const y = parseQuantity(words[1] ?? '', yUnit);
  if (!y.ok) return fail(`点の y が読めません: ${safeToken(words[1] ?? '')} (${y.reason})`, words[1]);
  if (Math.abs(x.value) > LIMITS.valueMax || Math.abs(y.value) > LIMITS.valueMax) return fail('点の値が大きすぎます', text);
  return ok({ x: x.value, y: y.value });
}
