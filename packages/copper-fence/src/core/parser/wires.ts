import { wireColor, wireColorNames } from 'fence-kit';
import { safeToken } from '../errors.ts';
import { parsePoint, pointProblem } from '../model/point.ts';
import type { WireSpec } from '../types.ts';
import { fail, ok, wordsOf } from './result.ts';
import type { LineResult } from './result.ts';

/**
 * `- P1 -- P2 [色]` — 島どうしのジャンパ (Manhattan の島を線でつなぐ)。
 * 端は島の名前か点。**線路は配線ではなく `copper:` に書く** (幅が要るため)。
 */
export function parseWireLine(text: string): LineResult<Omit<WireSpec, 'line'>> {
  const words = wordsOf(text);
  const [from, operator, to, color, ...rest] = words;
  if (from === undefined || operator !== '--' || to === undefined) {
    return fail('配線は `- 端 -- 端` で書きます (端は島の名前か x,y。例: - P1 -- P2)');
  }
  for (const end of [from, to]) {
    const problem = end.includes(',') && parsePoint(end) === null ? pointProblem(end) : null;
    if (problem !== null) return fail(problem, end);
  }
  if (color !== undefined && wireColor(color) === null) {
    return fail(`線の色として読めません: ${safeToken(color)} (${wireColorNames().join(' / ')})`, color);
  }
  if (rest.length > 0) return fail(`読めない語です: ${safeToken(rest.join(' '))}`, rest[0]);
  return ok({ from, to, color: color?.toLowerCase() ?? null });
}
