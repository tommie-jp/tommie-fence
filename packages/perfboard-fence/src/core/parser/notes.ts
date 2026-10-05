import { colorHint, isColor } from '../color.ts';
import { fenceError, safeToken } from '../errors.ts';
import { isAddressSpelling } from '../model/address.ts';
import { LIMITS, clampText } from '../limits.ts';
import type { Parsed } from './parts.ts';

/**
 * `notes:` の 1 行。**図に印を付けて、文章から指せるようにする**ためのもので、
 * 回路の一員ではない (ネットにもネットリストにも出ない)。
 *
 * 印は 6 つ。`mark` (丸)、`box` (枠)、`arrow` (指し棒)、`text` (字)、
 * `source` (そのフェンスの中身の書き出し)、`parts` (部品表)。
 *
 * **`text` の字は `:` の後ろ**なので、番地のあとの語 (色・向き・`large` `bold`) と
 * 紛れない。`source` と `parts` には色だけが書ける。
 */

import { PLAIN_LOOK } from '../types.ts';
import type { NoteKind, TextLook } from '../types.ts';
import { MIRROR_WORD, NO_TURN, isRotationWord, rotationOf } from '../parts/orient.ts';
import type { Turn } from '../parts/orient.ts';

export type { NoteKind };

export type WrittenNote = {
  readonly kind: NoteKind;
  /** 書かれた語 (種類の語も含む)。**そのまま書き戻す**ために持つ (52 の docs/54)。 */
  readonly written: readonly string[];
  /** `text` の本文を書かれたまま (引用符を含む)。`text` 以外は null。 */
  readonly bodyWritten: string | null;
  /**
   * 向き。**番地のあとの語**で書く (`- text f6 blue r90: ここから電源`)。
   * 部品と同じ語彙 (`r90` / `r180` / `r270` / `mirror`) で、書けるのは `text` だけ。
   *
   * 字は `: ` の後ろなので、番地のあとに語を置いても字と紛れない (色も同じ場所に書ける)。
   */
  readonly turn: Turn;
  /** 字の見た目。`large` (大きく) と `bold` (太く) の語で書く。`text` 以外はいつも `PLAIN_LOOK`。 */
  readonly look: TextLook;
  /** 指し先の番地。**`source` と `parts` は基板の外に出すので null**。 */
  readonly from: string | null;
  /** `box` と `arrow` の 2 つ目の番地。ほかは null。 */
  readonly to: string | null;
  readonly color: string | null;
  /** `text` の言葉。ほかは null。 */
  readonly text: string | null;
};

/** 印ごとに、番地をいくつ書くか。**書き出しと部品表は基板の外なので 0**。 */
const HOLES: Record<NoteKind, number> = { mark: 1, box: 2, arrow: 2, text: 1, source: 0, parts: 0 };

const KINDS = Object.keys(HOLES) as readonly NoteKind[];

const fail = (message: string, token?: string): Parsed<never> =>
  ({ ok: false, error: fenceError(message, null, token) });

const isKind = (word: string): word is NoteKind => (KINDS as readonly string[]).includes(word);

/** 字を穴のどちら側へ置くかの語。 */
const SIDE_WORDS = ['left', 'right', 'center'] as const;
type SideWord = (typeof SIDE_WORDS)[number];
const isSideWord = (word: string): word is SideWord => (SIDE_WORDS as readonly string[]).includes(word);

/** 字の見た目の語。**閉じた並び**なので、色や向きと順不同に書いても紛れない。 */
const LOOK_WORDS = ['large', 'bold'] as const;
type LookWord = (typeof LOOK_WORDS)[number];
const isLookWord = (word: string): word is LookWord => (LOOK_WORDS as readonly string[]).includes(word);

/**
 * `text` の語。**色と向きと見た目 (`large` `bold`)** で、どれも閉じた並び。
 * 順不同に書けるので、語のほうからどの枠かを決める。
 */
function readWords(
  tokens: readonly string[],
): Parsed<{ readonly color: string | null; readonly turn: Turn; readonly look: TextLook }> {
  let color: string | null = null;
  let turn = NO_TURN;
  let look = PLAIN_LOOK;
  for (const token of tokens) {
    const word = token.toLowerCase();
    if (isRotationWord(word)) turn = { ...turn, rotate: rotationOf(word) ?? turn.rotate };
    else if (word === MIRROR_WORD) turn = { ...turn, mirror: true };
    else if (isSideWord(word)) {
      if (look.side !== null) return fail(`注釈の left / right / center は 1 つだけ書けます: ${safeToken(token)}`, token);
      look = { ...look, side: word };
    } else if (isLookWord(word)) {
      if (look[word]) return fail(`注釈の ${word} が 2 回書かれています`, token);
      look = { ...look, [word]: true };
    } else if (isColor(word)) {
      if (color !== null) return fail(`注釈の色が 2 回書かれています: ${safeToken(token)}`, token);
      color = word;
    } else {
      return fail(
        `注釈の知らない語です: ${safeToken(token)}`
        + ` (色、r90 / r180 / r270 / ${MIRROR_WORD}、${LOOK_WORDS.join(' / ')}、${SIDE_WORDS.join(' / ')} が書けます)`,
        token,
      );
    }
  }
  if (look.side !== null && (turn.rotate !== 0 || turn.mirror)) {
    return fail(`${look.side} は向き (r90 / r180 / r270 / ${MIRROR_WORD}) と一緒には書けません`);
  }
  return { ok: true, value: { color, turn, look } };
}

/**
 * 注釈 1 つを読む。**`text` の字は `head` ではなく `text` に来る** —
 * `- text c3 red: ここから電源` は 1 項目のマップとして読まれるため
 * (3 つのフェンスで同じ形。`parser/parseFence.ts` が割って渡す)。
 */
export function parseNoteLine(
  line: string,
  written: string | null,
  /** `text` の本文を書かれたまま (引用符を含む)。渡されなければ読んだ字そのもの。 */
  bodyWritten: string | null = written,
): Parsed<WrittenNote> {
  const tokens = line.trim().split(/\s+/).filter((token) => token !== '');
  const [kind, ...rest] = tokens;

  if (kind === undefined) return fail(`注釈が空です (${KINDS.join(' / ')} のどれかで書きます)`);
  if (!isKind(kind)) {
    return fail(`知らない注釈です: ${safeToken(kind)} (${KINDS.join(' / ')})`, kind);
  }
  if (kind === 'text' && written === null) {
    return fail('text は「- text 番地 [語]: 字」の形で、字を : の後ろに書きます', kind);
  }
  if (kind !== 'text' && written !== null) {
    return fail(`${kind} に字は書けません (字を置くのは text です)`, kind);
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
    // **字は `: ` の後ろ**なので、番地のあとに残るのは語だけ。
    // 語の並びが閉じたので、`text` にも色を書ける (以前は字と区別が付かなかった)。
    const words = readWords(tail);
    if (!words.ok) return words;
    const text = (written ?? '').trim();
    if (text === '') return fail('text には図に出す字を書きます', kind);
    return {
      ok: true,
      value: {
        kind, turn: words.value.turn, look: words.value.look, from, to: null,
        color: words.value.color, text: clampText(text, LIMITS.noteLength),
        written: tokens, bodyWritten,
      },
    };
  }

  if (tail.length === 0) {
    return {
      ok: true,
      value: { kind, turn: NO_TURN, look: PLAIN_LOOK, from, to, color: null, text: null, written: tokens, bodyWritten: null },
    };
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

  const word = tail[0] as string;
  const color = word.toLowerCase();
  if (!isColor(color)) {
    // **綴りは書かれたまま返す** (小文字に直して返すと、探す字と違う字を見せる)。
    // 番地を書いた人には、色の話ではなく**置き場所は選べない**ことを言う —
    // 書き出しは図の下の帯に出るので、番地を書いても動かせない。
    if (wanted === 0 && isAddressSpelling(word)) {
      return fail(`${kind} に番地は書けません (図の下に出します): ${safeToken(word)}`, word);
    }
    return fail(`知らない色です: ${safeToken(word)} (${colorHint()})`, word);
  }
  return {
    ok: true,
    value: { kind, turn: NO_TURN, look: PLAIN_LOOK, from, to, color, text: null, written: tokens, bodyWritten: null },
  };
}
