import { LIMITS } from '../limits.ts';
import { safeToken } from '../errors.ts';
import { parseLength, parsePoint, parseSize, pointProblem } from '../model/point.ts';
import type { CopperSpec, Mm } from '../types.ts';
import { fail, ok, wordsOf } from './result.ts';
import type { LineResult } from './result.ts';

/** 書ける形。**並びが文書の並び**。 */
export const COPPER_KINDS = ['line', 'pad', 'via', 'slot'] as const;

/** 島の既定の大きさ (mm)。**MeSQUARES (6.35mm 角) より一回り小さい**、手で切りやすい大きさ。 */
export const DEFAULT_PAD = 4;
/** via の既定の穴 (mm)。0.8mm の錐と、そこへ通すすずめっき線。 */
export const DEFAULT_DRILL = 0.8;

const inRange = (value: number): boolean => value >= LIMITS.sizeMin && value <= LIMITS.sizeMax;

const sizeHint = `${LIMITS.sizeMin}〜${LIMITS.sizeMax}mm`;

/** 点を 1 つ読む。点らしいが読めないなら、そのわけ。 */
function readPoint(word: string | undefined, what: string, example: string): Mm | string {
  if (word === undefined) return `${what}を x,y (mm) で書きます (例: ${example})`;
  const point = parsePoint(word);
  if (point !== null) return point;
  return pointProblem(word) ?? `${what}として読めません: ${safeToken(word)} (x,y を mm で書きます)`;
}

/** 余った語。**黙って捨てない** (書いたつもりの幅や隙間が効いていないことに気づけない)。 */
const extra = (words: readonly string[]): string | null =>
  (words.length === 0 ? null : `読めない語です: ${safeToken(words.join(' '))}`);

/**
 * `line 0,10 40,10 3.0 [gap 0.3]` — 点を 2 つ以上、幅、表が地の板なら溝の幅。
 * **斜めの区間はここでは断らない** (形にするとき区間ごとに言い、残りは描く)。
 */
function readLine(id: string, words: string[]): LineResult<CopperSpec> {
  const points: Mm[] = [];
  let index = 1;
  for (; index < words.length; index += 1) {
    const word = words[index] ?? '';
    if (!word.includes(',')) break;
    const point = parsePoint(word);
    if (point === null) return fail(pointProblem(word) ?? `点として読めません: ${safeToken(word)}`, word);
    points.push(point);
  }
  if (points.length < 2) return fail('線路は点を 2 つ以上と幅を書きます (例: line 0,10 40,10 3.0)');
  if (points.length > LIMITS.polylinePoints) {
    return fail(`線路の点が多すぎます (${LIMITS.polylinePoints} 個まで)`);
  }
  for (let at = 1; at < points.length; at += 1) {
    const [a, b] = [points[at - 1], points[at]];
    if (a !== undefined && b !== undefined && a.x === b.x && a.y === b.y) {
      return fail(`同じ点が続いています: ${words[at + 1] ?? ''}`, words[at + 1]);
    }
  }
  const widthWord = words[index];
  if (widthWord === undefined) return fail('線路の幅 (mm) を書きます (例: line 0,10 40,10 3.0)');
  const width = parseLength(widthWord);
  if (width === null || !inRange(width)) {
    return fail(`線路の幅として読めません: ${safeToken(widthWord)} (${sizeHint})`, widthWord);
  }
  let gap: number | null = null;
  let rest = words.slice(index + 1);
  if (rest[0] === 'gap') {
    const gapWord = rest[1];
    const read = gapWord === undefined ? null : parseLength(gapWord);
    if (read === null || !inRange(read)) {
      return fail(`gap のあとに溝の幅 (mm) を書きます (${sizeHint})`, gapWord ?? 'gap');
    }
    gap = read;
    rest = rest.slice(2);
  }
  const left = extra(rest);
  if (left !== null) return fail(left, rest[0]);
  return ok({ kind: 'line', id, points, width, gap, line: null });
}

/** `pad 30,3 [4x4]` と `slot 5,16 20x1`。中心と大きさ。 */
function readBox(id: string, kind: 'pad' | 'slot', words: string[]): LineResult<CopperSpec> {
  const example = kind === 'pad' ? 'pad 30,3 4x4' : 'slot 20,16 20x1';
  const at = readPoint(words[1], '中心', example);
  if (typeof at === 'string') return fail(at, words[1]);
  const sizeWord = words[2];
  if (sizeWord === undefined && kind === 'slot') return fail(`切り欠きの大きさを書きます (例: ${example})`);
  const size = sizeWord === undefined ? { width: DEFAULT_PAD, height: DEFAULT_PAD } : parseSize(sizeWord);
  if (size === null || !inRange(size.width) || !inRange(size.height)) {
    return fail(`大きさとして読めません: ${safeToken(sizeWord ?? '')} (幅x高さを mm で。${sizeHint})`, sizeWord);
  }
  const left = extra(words.slice(3));
  if (left !== null) return fail(left, words[3]);
  return ok({ kind, id, at, width: size.width, height: size.height, line: null });
}

/** `via 30,5 [0.8]`。中心と穴の径。 */
function readVia(id: string, words: string[]): LineResult<CopperSpec> {
  const at = readPoint(words[1], '中心', 'via 30,5');
  if (typeof at === 'string') return fail(at, words[1]);
  const drillWord = words[2];
  const drill = drillWord === undefined ? DEFAULT_DRILL : parseLength(drillWord);
  if (drill === null || !inRange(drill)) {
    return fail(`穴の径として読めません: ${safeToken(drillWord ?? '')} (${sizeHint})`, drillWord);
  }
  const left = extra(words.slice(3));
  if (left !== null) return fail(left, words[3]);
  return ok({ kind: 'via', id, at, drill, line: null });
}

/** `copper:` の 1 行。 */
export function parseCopperLine(id: string, text: string): LineResult<CopperSpec> {
  const words = wordsOf(text);
  const kind = (words[0] ?? '').toLowerCase();
  switch (kind) {
    case 'line': return readLine(id, words);
    case 'pad': return readBox(id, 'pad', words);
    case 'slot': return readBox(id, 'slot', words);
    case 'via': return readVia(id, words);
    default:
      return fail(`知らない形です: ${safeToken(words[0] ?? '')} (${COPPER_KINDS.join(' / ')})`, words[0]);
  }
}
