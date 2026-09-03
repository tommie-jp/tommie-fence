import { colorHint, isColor } from '../color.ts';
import { fenceError, safeToken } from '../errors.ts';
import { parseAddress } from '../model/address.ts';
import { LIMITS, clampText } from '../limits.ts';
import type { Parsed } from './parts.ts';

/**
 * `notes:` の 1 行。**図に印を付けて、文章から指せるようにする**ためのもので、
 * 回路の一員ではない (ネットにもネットリストにも出ない)。
 *
 * 印は 6 つ。`mark` (丸)、`box` (枠)、`arrow` (指し棒)、`text` (字)、
 * `source` (そのフェンスの中身の書き出し)、`parts` (部品表)。
 *
 * **色は `text` には書けない。** 字は残り全部を言葉として取るので、色を許すと
 * 「色の名前で始まる注釈」が黙って色になる。区別の付かない書き方を作らない。
 * **`source` と `parts` には書ける** — 言葉を取らないので、色と紛れる余地がない。
 */

import type { NoteKind } from '../types.ts';
import { MIRROR_WORD, NO_TURN, isRotationWord, rotationOf } from '../parts/orient.ts';
import type { Turn } from '../parts/orient.ts';

export type { NoteKind };

export type WrittenNote = {
  readonly kind: NoteKind;
  /**
   * 向き。**種類に `/` で続けて書く** (`text/r90`)。
   *
   * 部品は番地のあとに語で書く (`dip8 c3 r90`) が、**注釈の `text` は番地の
   * あとが全部言葉**なので、そこに語を置くと「r90 で始まる注釈」と区別が
   * 付かない。区別の付かない書き方は作らない (色を `text` に書けないのと
   * 同じ理由) ので、**姿の区切りと同じ `/`** に載せる。
   */
  readonly turn: Turn;
  /** 指し先の番地。**`source` と `parts` は板の外に出すので null**。 */
  readonly from: string | null;
  /** `box` と `arrow` の 2 つ目の番地。ほかは null。 */
  readonly to: string | null;
  readonly color: string | null;
  /** `text` の言葉。ほかは null。 */
  readonly text: string | null;
};

/** 印ごとに、番地をいくつ書くか。**書き出しと部品表は板の外なので 0**。 */
const HOLES: Record<NoteKind, number> = { mark: 1, box: 2, arrow: 2, text: 1, source: 0, parts: 0 };

const KINDS = Object.keys(HOLES) as readonly NoteKind[];

const fail = (message: string, token?: string): Parsed<never> =>
  ({ ok: false, error: fenceError(message, null, token) });

const isKind = (word: string): word is NoteKind => (KINDS as readonly string[]).includes(word);

/** 種類の語に付いた向き (`text/r90/mirror`)。読めない語はそのまま返して断らせる。 */
function splitTurn(written: string): { readonly kind: string; readonly turn: Turn; readonly bad: string | null } {
  const [kind = '', ...words] = written.split('/');
  let turn = NO_TURN;
  for (const word of words) {
    if (isRotationWord(word)) turn = { ...turn, rotate: rotationOf(word) ?? turn.rotate };
    else if (word === MIRROR_WORD) turn = { ...turn, mirror: true };
    else return { kind, turn: NO_TURN, bad: word };
  }
  return { kind, turn, bad: null };
}

export function parseNoteLine(line: string): Parsed<WrittenNote> {
  const tokens = line.trim().split(/\s+/).filter((token) => token !== '');
  const [head, ...rest] = tokens;

  if (head === undefined) return fail(`注釈が空です (${KINDS.join(' / ')} のどれかで書きます)`);
  const { kind, turn, bad } = splitTurn(head);
  if (bad !== null) {
    return fail(
      `知らない向きです: ${safeToken(bad)} (r90 / r180 / r270 / ${MIRROR_WORD} が書けます)`,
      head,
    );
  }
  if (!isKind(kind)) {
    return fail(`知らない注釈です: ${safeToken(kind)} (${KINDS.join(' / ')})`, head);
  }
  if (kind !== 'text' && (turn.rotate !== 0 || turn.mirror)) {
    return fail(`向きを書けるのは text だけです (${safeToken(kind)} に向きはありません)`, head);
  }

  const wanted = HOLES[kind];
  const holes = rest.slice(0, wanted);
  if (holes.length < wanted) {
    return fail(`${kind} は番地を ${wanted} つ書きます`, kind);
  }
  const [first = null, second = null] = holes;
  const from = wanted === 0 ? null : first;
  const to = wanted === 2 ? second : null;
  const tail = rest.slice(wanted);

  if (kind === 'text') {
    const text = tail.join(' ');
    if (text === '') return fail('text には図に出す言葉を書きます', kind);
    return { ok: true, value: { kind, turn, from, to: null, color: null, text: clampText(text, LIMITS.noteLength) } };
  }

  if (tail.length === 0) {
    return { ok: true, value: { kind, turn, from, to, color: null, text: null } };
  }
  if (tail.length > 1) {
    // **余った言葉を黙って捨てない。** 色を 2 つ書いた人が、片方が効いて
    // いないことに気づけない。
    return fail(
      wanted === 0
        ? `${kind} に書けるのは色 1 つだけです`
        : `${kind} に書けるのは番地 ${wanted} つと色 1 つだけです`,
      tail[1],
    );
  }

  const written = tail[0] as string;
  const color = written.toLowerCase();
  if (!isColor(color)) {
    // **綴りは書かれたまま返す** (小文字に直して返すと、探す字と違う字を見せる)。
    // 番地を書いた人には、色の話ではなく**置き場所は選べない**ことを言う —
    // 書き出しは図の下の帯に出るので、番地を書いても動かせない。
    if (wanted === 0 && parseAddress(written) !== null) {
      return fail(`${kind} に番地は書けません (図の下に出します): ${safeToken(written)}`, written);
    }
    return fail(`知らない色です: ${safeToken(written)} (${colorHint()})`, written);
  }
  return { ok: true, value: { kind, turn, from, to, color, text: null } };
}
