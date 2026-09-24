import { wireColor, wireColorNames } from 'fence-kit';
import { LIMITS, clampText } from '../limits.ts';
import { safeToken } from '../errors.ts';
import { parsePoint, pointProblem } from '../model/point.ts';
import type { Mm, NoteKind, NoteSpec, Turn } from '../types.ts';
import { fail, ok, wordsOf } from './result.ts';
import type { LineResult } from './result.ts';

/** 点の数で分けた注釈の種類。 */
const ONE_POINT: readonly NoteKind[] = ['mark', 'text'];
const TWO_POINTS: readonly NoteKind[] = ['box', 'arrow', 'dim'];
const NO_POINT: readonly NoteKind[] = ['source', 'parts'];

export const NOTE_KINDS: readonly NoteKind[] = [...ONE_POINT, ...TWO_POINTS, ...NO_POINT];

const TURNS: Readonly<Record<string, Turn>> = { r90: 90, r180: 180, r270: 270 };

/**
 * `notes:` の 1 行。`text` だけは字を `:` の後ろに書く (`- text 20,18: 字`。
 * YAML では 1 項目のマップになり、字が `text` に来る)。**perfboard と同じ形**。
 *
 * `dim` は寸法線 — 2 点の間に矢と長さ (mm) を出す。**手で切る板の寸法図**の
 * ための印で、長さは点から測るので書かない (書いた長さと点が食い違わない)。
 */
export function parseNoteLine(head: string, text: string | null): LineResult<Omit<NoteSpec, 'line'>> {
  const words = wordsOf(head);
  const kind = (words[0] ?? '').toLowerCase() as NoteKind;
  if (!NOTE_KINDS.includes(kind)) {
    return fail(`知らない注釈です: ${safeToken(words[0] ?? '')} (${NOTE_KINDS.join(' / ')})`, words[0]);
  }
  const wanted = ONE_POINT.includes(kind) ? 1 : TWO_POINTS.includes(kind) ? 2 : 0;
  const points: Mm[] = [];
  for (let index = 1; index <= wanted; index += 1) {
    const word = words[index];
    const point = word === undefined ? null : parsePoint(word);
    if (point === null) {
      const problem = word === undefined ? null : pointProblem(word);
      return fail(problem ?? `${kind} は点を ${wanted} つ書きます (x,y を mm で。例: ${example(kind)})`, word);
    }
    points.push(point);
  }
  const [a, b] = points;
  if (a !== undefined && b !== undefined && a.x === b.x && a.y === b.y) {
    return fail(`${kind} の 2 点が同じです`, words[2]);
  }
  let color: string | null = null;
  let turn: Turn = 0;
  for (const word of words.slice(wanted + 1)) {
    const lower = word.toLowerCase();
    if (Object.hasOwn(TURNS, lower) && kind === 'text') {
      turn = TURNS[lower] ?? 0;
      continue;
    }
    if (color === null && wireColor(lower) !== null) {
      color = lower;
      continue;
    }
    return fail(`注釈の知らない語です: ${safeToken(word)} (色は ${wireColorNames().join(' / ')})`, word);
  }
  if (kind === 'text') {
    if (text === null || text.trim() === '') return fail('text は字を : の後ろに書きます (例: - text 20,18: ここを切る)');
  } else if (text !== null) {
    return fail(`${kind} に字は書けません (字は text で書きます)`);
  }
  return ok({
    kind,
    from: points[0] ?? null,
    to: points[1] ?? null,
    color,
    text: text === null ? null : clampText(text, LIMITS.noteLength),
    turn,
  });
}

function example(kind: NoteKind): string {
  switch (kind) {
    case 'mark': return '- mark 20,10';
    case 'text': return '- text 20,18: ここを切る';
    case 'dim': return '- dim 0,22 40,22';
    default: return `- ${kind} 5,5 15,12`;
  }
}
