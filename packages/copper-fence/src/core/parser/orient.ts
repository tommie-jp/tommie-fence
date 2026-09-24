import type { Orient, Turn } from '../types.ts';

/**
 * 向きの語。**perfboard と同じ語彙** — `r90` `r180` `r270` は時計回り、
 * `mirror` は左右を裏返す。両方書くときは裏返してから回す。
 */
const TURNS: Readonly<Record<string, Turn>> = { r0: 0, r90: 90, r180: 180, r270: 270 };

export const isOrientWord = (word: string): boolean => Object.hasOwn(TURNS, word) || word === 'mirror';

/**
 * 語の並びから向きを拾う。**向きの語が 1 つも無ければ null** (書かなかったことを
 * 呼ぶ側が見分けられるように — チップは乗った線路の向きに従う)。
 * 残った語はそのまま返す。
 */
export function takeOrient(words: readonly string[]): { readonly orient: Orient | null; readonly rest: string[] } {
  let turn: Turn | null = null;
  let mirror = false;
  const rest: string[] = [];
  for (const word of words) {
    const lower = word.toLowerCase();
    if (Object.hasOwn(TURNS, lower)) {
      turn = TURNS[lower] ?? 0;
      continue;
    }
    if (lower === 'mirror') {
      mirror = true;
      continue;
    }
    rest.push(word);
  }
  return { orient: turn === null && !mirror ? null : { turn: turn ?? 0, mirror }, rest };
}
