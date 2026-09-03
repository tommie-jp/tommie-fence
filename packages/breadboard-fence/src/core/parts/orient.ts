import { lookupFootprint } from '../placement/footprints.ts';

/**
 * 部品の向き。**アンカー 1 つで置く形** (DIP / SIP / ボード) にだけ書ける。
 *
 * 足を並べて書く部品 (2 本足・3 本足) の向きは**穴の順そのもの**なので、
 * 語では書かない — 同じことを 2 通りで書けるようにすると、食い違ったときに
 * どちらが本当か決められなくなる (52 の docs/14)。
 *
 * **語彙と意味は circuit-fence / perfboard-fence と揃える。** 回転は**時計回り**。
 * 3 つのフェンスを同じノートで書く人が、覚え直さなくてよいようにするため。
 *
 * **この板で書けるのは `r180` だけ。** ほかの語は綴りとしては知っていて、
 * なぜ書けないかを言って断る (黙って無視しない):
 *
 * - `r90` / `r270` — **溝をまたぐ物理そのもの。** 2 列の足は e 行と f 行に
 *   固定されていて、90 度回すと 2 列が同じ列に重なる。1 列に並ぶ SIP でも、
 *   縦にすると足が全部同じ列 (同じ 5 穴) に入って短絡する。
 * - `mirror` — **アンカーの行がもう言っている。** `dip8 @ e5` を裏返した形は
 *   `dip8 @ f5` そのもので、語を足すと同じ置き方を 2 通りで書けてしまう。
 */

export type Turn = { readonly rotate: 0 | 180; readonly mirror: false };

export const NO_TURN: Turn = { rotate: 0, mirror: false };

export const isTurned = (turn: Turn): boolean => turn.rotate !== 0;

/** 書ける語。0 度は語を書かない (向きを書かないのと同じ)。 */
export const TURN_WORD = 'r180';

/**
 * 綴りとしては知っている語。**書けないものも並べる** — ほかの 2 つの
 * フェンスで書ける語をここで「知らない語」として扱うと、値やラベルとして
 * 黙って飲み込んでしまう。
 */
export const ORIENTATIONS: readonly string[] = [TURN_WORD, 'r90', 'r270', 'mirror'];

export const isOrientationWord = (token: string): boolean => ORIENTATIONS.includes(token);

/** その角度を書く語。0 度は語を書かない。 */
export const turnWord = (rotate: Turn['rotate']): string => (rotate === 0 ? '' : TURN_WORD);

/**
 * 書ける向き。**形が決める** — アンカー 1 つで置く形のうち、回すと足の並びが
 * 実際に変わるものだけ。
 *
 * タクトスイッチが `none` なのは**対称だから** — 回しても穴の組み合わせが
 * そのままで、変わるのは足に付けた名前だけになる。
 * 何も変わらない語を受け取ると、書いた人は「効いた」と思ってしまう。
 */
export type Orient = 'none' | 'half';

export function orientOf(type: string): Orient {
  const footprint = lookupFootprint(type);
  if (footprint === null) return 'none';
  return footprint.kind === 'dip' || footprint.kind === 'sip' || footprint.kind === 'board'
    ? 'half'
    : 'none';
}

/**
 * その語をこの部品に書けるか。書けないなら**なぜ書けないか**と、
 * 代わりにどう書くかを返す。
 *
 * **「回せません」では終わらせない** — 溝をまたぐ物理も、行がもう向きを
 * 言っていることも、断り文に入れないと直しようがない (52 の docs/14 の決め 3)。
 */
export function refusalFor(word: string, type: string): string | null {
  if (!isOrientationWord(word)) return `向きの語ではありません: ${word}`;

  const kind = lookupFootprint(type)?.kind;
  if (kind === 'device') {
    return `${type} に向きは書けません (帯に並べる機器は板に挿していないため)`;
  }
  if (kind === 'switch') {
    // アンカー 1 つで置く形だが、回しても穴の組み合わせはそのまま。
    return `${type} に向きは書けません (対称なので、回しても同じ穴どうしがつながります)`;
  }
  if (orientOf(type) === 'none') {
    return `${type} に向きは書けません`
      + ' (足を並べて書く部品の向きは穴の順そのものです)';
  }

  if (word === TURN_WORD) return null;

  if (word === 'mirror') {
    return `${type} に mirror は書けません`
      + ' (裏返した形はアンカーを反対の行に書いたものと同じです)';
  }
  return kind === 'sip'
    ? `${type} は 90 度回せません (1 列に並ぶので、縦にすると足が全部同じ 5 穴に入ります)`
    : `${type} は 90 度回せません (溝をまたぐので、2 列が同じ列に重なります)`;
}
