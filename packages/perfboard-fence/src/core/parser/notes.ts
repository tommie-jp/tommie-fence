import { wireColorNames } from 'fence-kit';
import { fenceError, safeToken } from '../errors.ts';
import { LIMITS, clampText } from '../limits.ts';
import type { Parsed } from './parts.ts';

/**
 * `notes:` の 1 行。**図に印を付けて、文章から指せるようにする**ためのもので、
 * 回路の一員ではない (ネットにもネットリストにも出ない)。
 *
 * 印は 4 つ。`mark` (丸)、`box` (枠)、`arrow` (指し棒)、`text` (字)。
 *
 * **色は `text` には書けない。** 字は残り全部を言葉として取るので、色を許すと
 * 「色の名前で始まる注釈」が黙って色になる。区別の付かない書き方を作らない。
 */

export type NoteKind = 'mark' | 'box' | 'arrow' | 'text';

export type WrittenNote = {
  readonly kind: NoteKind;
  readonly from: string;
  /** `box` と `arrow` の 2 つ目の番地。ほかは null。 */
  readonly to: string | null;
  readonly color: string | null;
  /** `text` の言葉。ほかは null。 */
  readonly text: string | null;
};

/** 印ごとに、番地をいくつ書くか。 */
const HOLES: Record<NoteKind, number> = { mark: 1, box: 2, arrow: 2, text: 1 };

const KINDS = Object.keys(HOLES) as readonly NoteKind[];

const fail = (message: string, token?: string): Parsed<never> =>
  ({ ok: false, error: fenceError(message, null, token) });

const isKind = (word: string): word is NoteKind => (KINDS as readonly string[]).includes(word);

export function parseNoteLine(line: string): Parsed<WrittenNote> {
  const tokens = line.trim().split(/\s+/).filter((token) => token !== '');
  const [kind, ...rest] = tokens;

  if (kind === undefined) return fail(`注釈が空です (${KINDS.join(' / ')} のどれかで書きます)`);
  if (!isKind(kind)) {
    return fail(`知らない注釈です: ${safeToken(kind)} (${KINDS.join(' / ')})`, kind);
  }

  const wanted = HOLES[kind];
  const holes = rest.slice(0, wanted);
  if (holes.length < wanted) {
    return fail(`${kind} は番地を ${wanted} つ書きます`, kind);
  }
  const [from = '', to = null] = holes;
  const tail = rest.slice(wanted);

  if (kind === 'text') {
    const text = tail.join(' ');
    if (text === '') return fail('text には図に出す言葉を書きます', kind);
    return { ok: true, value: { kind, from, to: null, color: null, text: clampText(text, LIMITS.noteLength) } };
  }

  if (tail.length === 0) {
    return { ok: true, value: { kind, from, to: wanted === 2 ? to : null, color: null, text: null } };
  }
  if (tail.length > 1) {
    // **余った言葉を黙って捨てない。** 色を 2 つ書いた人が、片方が効いて
    // いないことに気づけない。
    return fail(`${kind} に書けるのは番地 ${wanted} つと色 1 つだけです`, tail[1]);
  }

  const color = (tail[0] as string).toLowerCase();
  if (!wireColorNames().includes(color)) {
    return fail(`知らない色です: ${safeToken(color)} (${wireColorNames().slice(0, 6).join(' / ')} など)`, tail[0]);
  }
  return { ok: true, value: { kind, from, to: wanted === 2 ? to : null, color, text: null } };
}
