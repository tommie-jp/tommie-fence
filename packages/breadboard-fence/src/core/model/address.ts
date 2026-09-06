import type { Address, HoleRow } from '../types.ts';

/**
 * 番地の綴り。穴 (`a5`) と電源レール (`+t5`) のほか、**交点の間**を
 * 「行の英字 + 列の数字」の組で書ける (`b5c3` = b5 から 0.2 行下・0.3 列右)。
 *
 * **綴りは circuit と同じ**にしてある — 同じノートで両方のフェンスを書く人が、
 * 数え方を覚え直さなくてよいようにするため。組は 1 つ (小数第 1 位) まで。
 *
 * 端数が要るのは**注釈**だけ。部品と配線は穴に挿すもので、間には置けない
 * (置く側が断る)。字は図に添えるものなので、穴の無い所 — 溝の中、板の左右、
 * レールの外側 — にも置きたい (実機で「text はどこでも移動できるように」)。
 */

/** 端数の 1 桁を表す英字。**`a` = 0** で、行の英字と同じ数え方 (circuit と共通)。 */
const FRACTION_LETTERS = 'abcdefghij';

/** 組が 1 つも無いのと同じ意味になる綴り。`b5a0` は `b5` と同じ場所。 */
const EMPTY_PAIR = 'a0';

/** 端数の組 (`c3`)。1 組で小数第 1 位まで。 */
const PAIR = '(?:[a-j][0-9])?';

const HOLE_PATTERN = new RegExp(`^([a-j])(\\d{1,2})(${PAIR})$`);
const RAIL_PATTERN = new RegExp(`^([+-])([tb])(\\d{1,2})(${PAIR})$`);

/**
 * 組 → 行と列の端数。**端数が無ければ鍵ごと持たない** — 交点の番地は今までと
 * 同じ形のままにする (`{ kind, row, col }` を比べているところが多い)。
 */
function stepsOf(pair: string): { readonly rows?: number; readonly cols?: number } {
  if (pair === '') return {};
  return {
    rows: FRACTION_LETTERS.indexOf(pair[0] ?? 'a') / 10,
    cols: Number(pair[1] ?? 0) / 10,
  };
}

/** 端数を綴りに戻す。0 なら組を書かない (同じ場所の綴りを 1 つに保つ)。 */
function pairOf(address: Address): string {
  const rows = Math.round((address.rows ?? 0) * 10);
  const cols = Math.round((address.cols ?? 0) * 10);
  return rows === 0 && cols === 0 ? '' : `${FRACTION_LETTERS[rows] ?? 'a'}${cols}`;
}

/** 穴番地 (`a5`) と電源レール番地 (`+t5`)、その端数付き。列数の上限はボードが判定する。 */
export function parseAddress(text: string): Address | null {
  // 行ラベルは大文字でも印字できる (board.letters) ので、番地は大小どちらでも受けて小文字に正規化する。
  const token = text.toLowerCase();

  const hole = HOLE_PATTERN.exec(token);
  if (hole) {
    const [, row, digits, pair = ''] = hole;
    const col = Number(digits);
    if (col < 1 || pair === EMPTY_PAIR) return null;
    return { kind: 'hole', row: row as HoleRow, col, ...stepsOf(pair) };
  }

  const rail = RAIL_PATTERN.exec(token);
  if (rail) {
    const [, polarity, side, digits, pair = ''] = rail;
    const col = Number(digits);
    if (col < 1 || pair === EMPTY_PAIR) return null;
    return {
      kind: 'rail', polarity: polarity as '+' | '-', side: side as 't' | 'b', col, ...stepsOf(pair),
    };
  }

  return null;
}

export function formatAddress(address: Address): string {
  const head = address.kind === 'hole'
    ? `${address.row}${address.col}`
    : `${address.polarity}${address.side}${address.col}`;
  return `${head}${pairOf(address)}`;
}

/** 交点そのものか (端数を持たないか)。**穴に挿すものは交点だけ**。 */
export const isCrossing = (address: Address): boolean =>
  (address.rows ?? 0) === 0 && (address.cols ?? 0) === 0;

/** 溝より上のブロック (a〜e) かどうか。 */
export function isTopBlock(row: HoleRow): boolean {
  return row <= 'e';
}
