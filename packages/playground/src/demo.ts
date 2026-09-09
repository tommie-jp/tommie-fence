import type { Kind } from './kinds.ts';

/**
 * デモの「試す」釦。**仕組みを読ませずに見せる**ための仕掛け
 * (52 の docs/41)。押すと**字が変わって図が変わる**ところを同時に見せる —
 * 図だけが変わると魔法に見えるが、この頁の値打ちは「Markdown に書くと
 * 図になる」ことのほうなので、字が動くのを見せないと伝わらない。
 *
 * ここは DOM を知らない。釦を組むのは `main.ts`。
 */

export type Nudge = {
  /** 釦に出す字。 */
  readonly label: string;
  /** 探す字。**行の中で一意な断片**にする (値だけだと他の行にも当たる)。 */
  readonly find: string;
  readonly replace: string;
  /** 押したときに帯へ出す一言。何が変わったかを言う。 */
  readonly said: string;
};

/**
 * 1 か所だけ書き換えた字を返す。**ちょうど 1 か所のときだけ。**
 *
 * 0 か所 (もう押した・手で直した) と 2 か所以上 (どちらを替えるべきか
 * 決められない) では null を返す。呼ぶ側はそのとき釦を出さない —
 * **押しても何も起きない釦を並べない**ため。
 */
export function nudge(source: string, one: Nudge): string | null {
  const at = source.indexOf(one.find);
  if (at < 0) return null;
  if (source.indexOf(one.find, at + one.find.length) >= 0) return null;
  return source.slice(0, at) + one.replace + source.slice(at + one.find.length);
}

/**
 * 釦を添える例の題。**3 つのフェンスで同じ回路**なので 1 つで足りる
 * (52 の docs/41 の段 3)。他の例を選んだら釦は消える。
 */
export const DEMO_TITLE = '図01 LED と抵抗';

/**
 * 種類ごとの釦。**circuit には LED の色が無い** (色は実物の部品の話で、
 * 回路図の記号は色を持たない) ので、代わりに電池の電圧を動かす。
 */
const NUDGES: Record<Kind, readonly Nudge[]> = {
  circuit: [
    {
      label: '抵抗を 1k に',
      find: 'resistor a1 a3 330',
      replace: 'resistor a1 a3 1k',
      said: '抵抗を 330 Ω から 1 kΩ にした',
    },
    {
      label: '電池を 9V に',
      find: 'battery a1 c1 3',
      replace: 'battery a1 c1 9',
      said: '電池を 3 V から 9 V にした',
    },
  ],
  breadboard: [
    {
      label: '抵抗を 1k に',
      find: 'resistor a5 a10 330',
      replace: 'resistor a5 a10 1k',
      said: '抵抗を 330 Ω から 1 kΩ にした (帯の色が変わる)',
    },
    {
      label: 'LED を青に',
      find: 'b13(K) red',
      replace: 'b13(K) blue',
      said: 'LED を青にした',
    },
  ],
  perfboard: [
    {
      label: '抵抗を 1k に',
      find: 'resistor c3 c7 330',
      replace: 'resistor c3 c7 1k',
      said: '抵抗を 330 Ω から 1 kΩ にした (帯の色が変わる)',
    },
    {
      label: 'LED を青に',
      find: 'led c9 c11 red',
      replace: 'led c9 c11 blue',
      said: 'LED を青にした',
    },
  ],
};

/** その種類・その例に添える釦。**題で引く** — 別の例を選んだら空。 */
export const nudgesFor = (kind: Kind, title: string): readonly Nudge[] =>
  title === DEMO_TITLE ? NUDGES[kind] : [];
