/**
 * 部品の定格・想定値の記法 (`i=3mA` `vf=2.0V` `v=16V`)。**図には出さず、部品表の値の欄に添える**
 * (52 の docs/152)。買うとき・挿すときに要るのに、図の絵からは読めない値。
 *
 * - `i=` — LED の点灯時の想定電流
 * - `vf=` — LED の順電圧 (電流の計算の前提)
 * - `v=` — コンデンサの耐圧 (電解は足りないと壊れる)
 *
 * breadboard と perfboard が同じ表を読む。書ける部品・単位・表での見せ方をここ 1 か所に置く。
 */
export type RatingTag = 'i' | 'vf' | 'v';

/** 書いた値 (書かれたまま)。部品ごとに持つ。 */
export type PartRatings = Readonly<Partial<Record<RatingTag, string>>>;

type RatingSpec = {
  readonly tag: RatingTag;
  /** 書ける部品の種類 (略記を畳んだあとの正式名)。 */
  readonly types: readonly string[];
  /** 断るときに出す部品の呼び名。 */
  readonly named: string;
  readonly unit: RegExp;
  readonly what: string;
  readonly example: string;
  /** 部品表での見せ方。 */
  readonly shown: (value: string) => string;
};

/** 表の値の欄に並べる順も、この順。 */
const RATINGS: readonly RatingSpec[] = [
  { tag: 'i', types: ['led'], named: 'LED', unit: /^\d+(\.\d+)?(uA|µA|mA|A)$/, what: '電流', example: 'i=3mA', shown: (value) => value },
  { tag: 'vf', types: ['led'], named: 'LED', unit: /^\d+(\.\d+)?V$/, what: '順電圧', example: 'vf=2.0V', shown: (value) => `VF ${value}` },
  { tag: 'v', types: ['capacitor'], named: 'コンデンサ', unit: /^\d+(\.\d+)?V$/, what: '耐圧', example: 'v=16V', shown: (value) => value },
];

const TAG_PATTERN = /^(i|vf|v)=(.*)$/;

export type RatingRead =
  | { readonly ok: true; readonly tag: RatingTag; readonly value: string }
  | { readonly ok: false; readonly message: string };

/**
 * 1 語を定格として読む。定格の形 (`i=` `vf=` `v=`) でなければ null (呼ぶ側はほかの語として読む)。
 * 書けない部品・単位の無い値・同じ記法の 2 度書きは断る (黙って読み飛ばすと、効かなかったことが伝わらない)。
 */
export function readRating(token: string, type: string, already: PartRatings): RatingRead | null {
  const match = TAG_PATTERN.exec(token);
  if (match === null) return null;
  const tag = match[1] as RatingTag;
  const value = match[2] ?? '';
  const spec = RATINGS.find((rating) => rating.tag === tag)!;
  if (!spec.types.includes(type)) {
    return { ok: false, message: `${tag}= (${spec.what}) は ${spec.named}だけに書けます` };
  }
  if (already[tag] !== undefined) return { ok: false, message: `${tag}= が 2 回書かれています` };
  if (!spec.unit.test(value)) {
    return { ok: false, message: `${tag}= は${spec.what}を単位つきで書きます (例: ${spec.example}。今は ${value})` };
  }
  return { ok: true, tag, value };
}

/** 書き戻す語 (`i=3mA vf=2.0V`)。表の順に並べる。 */
export const ratingWords = (ratings: PartRatings | null | undefined): readonly string[] =>
  RATINGS.flatMap((rating) => (ratings?.[rating.tag] === undefined ? [] : [`${rating.tag}=${ratings[rating.tag]}`]));

/** 部品表の値の欄に添える (`red 3mA VF 2.0V`、`1000uF 16V`)。 */
export const withRatings = (text: string, ratings: PartRatings | null | undefined): string =>
  [text, ...RATINGS.flatMap((rating) => (ratings?.[rating.tag] === undefined ? [] : [rating.shown(ratings[rating.tag]!)]))]
    .filter((part) => part !== '')
    .join(' ');
