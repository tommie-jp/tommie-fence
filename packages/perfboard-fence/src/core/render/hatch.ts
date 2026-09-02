import { element, num } from 'fence-kit';

/**
 * 白黒で刷る図 (`theme: mono`) のための、**色の代わりの網と線の型**。
 *
 * 白黒のテーマは「色で意味を持たせない」ことが値打ちなのに、配線の色も
 * LED の色も**実物の色**なのでテーマでは動かず、白黒の図に色だけが残っていた。
 * 色を落とすと今度は「同じ色の線は同じ網」が読めなくなる。
 *
 * そこで**色を形に移す** — 面は網 (`<pattern>`)、線は線の型 (`stroke-dasharray`)。
 * どちらも同じ色から決まるので、図の中で 1 つの色は 1 つの見た目になる。
 * 引き当てるための凡例は `legend.ts` が図の下に出す。
 *
 * **色の名前を持たない図には何も足さない。** 色を書かなければ網も凡例も出ない
 * (白黒の図が、使ってもいない色の表を抱えることがない)。
 */

/** 凡例に出す色の名前。**実物を指すときに使う日本語の呼び名**。 */
const NAMES: Record<string, string> = {
  red: '赤',
  black: '黒',
  white: '白',
  gray: '灰',
  grey: '灰',
  orange: '橙',
  yellow: '黄',
  green: '緑',
  blue: '青',
  purple: '紫',
  violet: '紫',
  brown: '茶',
  pink: '桃',
  gold: '金',
  silver: '銀',
};

export const colorName = (color: string): string =>
  Object.hasOwn(NAMES, color) ? NAMES[color] ?? color : color;

/**
 * 網の描き方。`lines` は 1 タイルに引く線 (タイルの中の座標)、`dots` は丸。
 * **タイルは 6×6 に揃える** — 大きさを混ぜると、同じ密度に見えて見分けにくい。
 */
type Weave = {
  /** タイルに引く線。空なら塗りつぶし (黒)。 */
  readonly lines: readonly (readonly [number, number, number, number])[];
  readonly dots: readonly (readonly [number, number])[];
  /** 線の太さ。細い網と太い網で密度を分ける。 */
  readonly weight: number;
};

const TILE = 6;

/** 塗りつぶし (網を持たない色)。 */
const SOLID: Weave = { lines: [], dots: [], weight: 0 };

/**
 * 色ごとの見た目。**網と線の型を同じ色から決める** — 図の中で 1 つの色が
 * 2 通りに見えると、凡例を引いても線と面がつながらない。
 *
 * 黒は塗りつぶしと実線にしてある。**いちばん多く使う色 (GND) を素の形に置く**と、
 * 網が付いた線だけが「色を書いた線」として目に立つ。
 */
const INKS: Record<string, { readonly weave: Weave; readonly dash: string }> = {
  black: { weave: SOLID, dash: '' },
  red: { weave: { lines: [[-1, 5, 5, -1], [1, 7, 7, 1]], dots: [], weight: 1.6 }, dash: '7 3' },
  white: { weave: { lines: [], dots: [[1.5, 1.5], [4.5, 4.5]], weight: 1.2 }, dash: '1.5 3' },
  yellow: { weave: { lines: [[-1, 1, 5, 7], [1, -1, 7, 5]], dots: [], weight: 1.6 }, dash: '10 3 2 3' },
  blue: { weave: { lines: [[1.5, -1, 1.5, 7], [4.5, -1, 4.5, 7]], dots: [], weight: 1.2 }, dash: '3 3' },
  green: { weave: { lines: [[-1, 5, 5, -1], [-1, 1, 5, 7]], dots: [], weight: 1 }, dash: '12 4' },
  orange: { weave: { lines: [[-1, 3, 3, -1]], dots: [], weight: 2 }, dash: '7 3 2 3 2 3' },
  gray: { weave: { lines: [[-1, 1.5, 7, 1.5], [-1, 4.5, 7, 4.5]], dots: [], weight: 1.2 }, dash: '5 5' },
  brown: { weave: { lines: [[3, -1, 3, 7]], dots: [], weight: 2 }, dash: '10 3 1 3 1 3' },
  purple: { weave: { lines: [[-1, 3, 3, 7]], dots: [], weight: 1.6 }, dash: '2 2 6 2' },
  pink: { weave: { lines: [], dots: [[3, 3]], weight: 2 }, dash: '6 2 2 2' },
  // カラーコードにだけ出る色。配線には無いので、線の型は使われない。
  violet: { weave: { lines: [[-1, 3, 3, 7], [3, -1, 7, 3]], dots: [], weight: 1.6 }, dash: '2 2 6 2' },
  gold: { weave: { lines: [[-1, 5, 5, -1]], dots: [[4.5, 4.5]], weight: 1.2 }, dash: '4 2 1 2' },
  silver: { weave: { lines: [[-1, 1, 5, 7]], dots: [[1.5, 1.5]], weight: 1.2 }, dash: '1 2 4 2' },
};

const inkOf = (color: string): { readonly weave: Weave; readonly dash: string } | null =>
  Object.hasOwn(INKS, color) ? INKS[color] ?? null : null;

/** 網の `<pattern>` の id。同じ色なら中身も同じなので、図が並んでも困らない。 */
export const hatchId = (color: string): string => `pf-hatch-${color}`;

/**
 * 面をこの色で塗るときの `fill`。**網を持たない色は地の色そのもの** (黒)。
 * 知らない色にも地の色を返す — 白黒の図に色が漏れないことのほうが大事。
 */
export function hatchFill(color: string, ink: string): string {
  const found = inkOf(color);
  return found === null || found.weave === SOLID ? ink : `url(#${hatchId(color)})`;
}

/** 線をこの色で引くときの `stroke-dasharray`。実線なら空。 */
export const hatchDash = (color: string): string => inkOf(color)?.dash ?? '';

/** 網を持つ色か。凡例に並べるかどうかもこれで決める。 */
export const hasHatch = (color: string): boolean => inkOf(color) !== null;

/**
 * 使った色ぶんの `<pattern>`。**図が使った色だけ**を書き出す
 * (使っていない網を抱えた SVG を、他人のノートに貼らせない)。
 */
export function hatchDefs(colors: readonly string[], ink: string, plate: string): string {
  const woven = colors.flatMap((color) => {
    const found = inkOf(color);
    return found === null || found.weave === SOLID ? [] : [[color, found.weave] as const];
  });
  if (woven.length === 0) return '';

  const patterns = woven
    .map(([color, weave]) => element(
      'pattern',
      {
        id: hatchId(color),
        width: TILE, height: TILE,
        patternUnits: 'userSpaceOnUse',
      },
      // **地を敷く。** 敷かないと網の隙間から下の板が透けて、同じ網でも
      // 板の色ごとに違う濃さに見える。
      element('rect', { x: 0, y: 0, width: TILE, height: TILE, fill: plate })
      + weave.lines
        .map(([x1, y1, x2, y2]) => element('line', {
          x1: num(x1), y1: num(y1), x2: num(x2), y2: num(y2),
          stroke: ink, 'stroke-width': num(weave.weight),
        }))
        .join('')
      + weave.dots
        .map(([cx, cy]) => element('circle', {
          cx: num(cx), cy: num(cy), r: num(weave.weight), fill: ink,
        }))
        .join(''),
    ))
    .join('');

  return element('defs', {}, patterns);
}
