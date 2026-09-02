import type { PartSpec } from '../types.ts';

/**
 * 部品を 1 つに指す**名札**。マップ (移動エディタ) から「どれを掴んだのか」を
 * 伝えるための綴りで、フェンスには現れない。
 *
 * **名前が重なるのは `port` / `vcc` / `vee` だけ** — ID がそのまま図に出て
 * ネットの名前にもなる記号で、`VCC` を何か所にも描くのは回路図の書き方そのもの。
 * ほかの部品の ID は配線から指すための名前なので、重なりようがない。
 *
 * だから**重なっていない部品は名前そのものが名札**で、今までの綴りは動かない。
 * 重なったときだけ、書いた順の 2 つ目から `VCC#2` `VCC#3` と数える。
 * `#` は ID に使えない字なので (`limits.ts` の `isReferenceable`)、
 * **名札と名前が紛れることはない**。
 *
 * 名札は書いた順で決まるので、**同じ名前の記号を消したり足したりすると動く**。
 * マップは書き換えのたびに作り直され、選び直しもそこで起きるので困らない
 * (行番号を名札にすると、フロー形式で 1 行に 2 つ書いたときに割れない)。
 */

/** 名前と番号の区切り。ID に使えない字を選んである。 */
const MARK = '#';

/** 書いた順で `index` 番目の部品の名札。範囲外なら空。 */
export function handleAt(parts: readonly PartSpec[], index: number): string {
  const part = parts[index];
  if (part === undefined) return '';

  const before = parts.slice(0, index).filter((other) => other.id === part.id).length;
  return before === 0 ? part.id : `${part.id}${MARK}${before + 1}`;
}

/** その部品の名札。**同じ配列から取った部品**を渡す (`indexOf` で数えるため)。 */
export const handleOf = (parts: readonly PartSpec[], part: PartSpec): string =>
  handleAt(parts, parts.indexOf(part));

/**
 * 名札が指している名前 (図に出るほう)。**人に見せる字はこちら** —
 * 「VCC#2 を消しています」ではなく「VCC を消しています」と言う。
 */
export const nameOfHandle = (handle: string): string => handle.split(MARK)[0] ?? handle;

/**
 * 名札の指す部品。無ければ null。
 *
 * **番号の無い名札は 1 つ目**を指す。名前が重なっていないフェンスでは
 * それが唯一の部品なので、今までどおり名前だけで指せる。
 */
export function partOfHandle(parts: readonly PartSpec[], handle: string): PartSpec | null {
  const [name = '', nth, ...rest] = handle.split(MARK);
  if (rest.length > 0) return null;

  const found = parts.filter((part) => part.id === name);
  if (nth === undefined) return found[0] ?? null;

  // **数でない添字は指せない**とする (`VCC#a` を 1 つ目に読むと、
  // 綴りを間違えた人が違う部品を書き換えたことに気づけない)。
  const index = /^[0-9]+$/.test(nth) ? Number(nth) - 1 : -1;
  return index < 0 ? null : found[index] ?? null;
}

/** その名前の部品が 2 つ以上あるか。**名札を出すかどうかを決めるのに使う。** */
export const isRepeatedName = (parts: readonly PartSpec[], id: string): boolean =>
  parts.filter((part) => part.id === id).length > 1;
