/**
 * 部品の姿 (パッケージ)。**種類が電気的な役割、姿が実物のかたち**で、
 * 同じ `capacitor` でもセラミックと電解では板の上の姿が違う。
 * フェンスには `capacitor/ceramic` のように種類に続けて書く。
 *
 * 色は種類のもの、形が姿のもの、と決めてある。図の中で
 * 「コンデンサだ」と分かるのは色、「どのコンデンサか」は形で読ませる。
 */

export type PartType = { readonly type: string; readonly variant: string | null };

/**
 * 種類ごとに選べる姿。ここに無い種類には `/…` を書けない。
 * 描き分けられない姿を黙って受け取ると、実物と違うかたちの図になるため。
 */
const VARIANTS: Record<string, readonly string[]> = {
  capacitor: ['ceramic', 'film', 'electrolytic'],
};

/**
 * 向きのある姿。マイナス側に帯を描くので、**どちらの足が `-` かが要る**。
 * タンタルを足すときもここに入れる。
 */
const POLAR_VARIANTS: ReadonlySet<string> = new Set(['electrolytic']);

/**
 * `capacitor/ceramic` を種類と姿に割る。`/` の左右どちらかが空のときは割らず、
 * 種類の名前として丸ごと返す (`capacitor/` は書きかけなので、知らない種類として
 * 書いたまま報告させる。ここで「姿が空です」と言うより直す場所が分かる)。
 */
export function splitPartType(token: string): PartType {
  const slash = token.indexOf('/');
  if (slash <= 0 || slash === token.length - 1) return { type: token, variant: null };
  return { type: token.slice(0, slash), variant: token.slice(slash + 1) };
}

/**
 * その種類に選べる姿。種類名は入力から来るので、必ず自分の持ち物だけを引く
 * (`parts/boards.ts` と同じ理由。素の添字だと `constructor` が Object.prototype から拾える)。
 */
export const variantsOf = (type: string): readonly string[] =>
  Object.hasOwn(VARIANTS, type) ? VARIANTS[type] ?? [] : [];

/** 向きのある姿か。ピン名 `(+)` `(-)` を要求するかどうかがこれで決まる。 */
export const isPolarVariant = (variant: string): boolean => POLAR_VARIANTS.has(variant);

/** 姿を選べる種類。書けない種類に姿が付いたときの案内に使う。 */
export const typesWithVariants = (): readonly string[] => Object.keys(VARIANTS);
