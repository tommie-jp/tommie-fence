import { num } from './num.ts';

/**
 * ピンヘッダ (`sipN`) の記号。**circuitikz に無いので自分で宣言する。**
 *
 * 回路図のヘッダは「箱の片側に足が並ぶ」形で、circuitikz 1.0 にはその記号が
 * 無い (`nport` も無いことを実機で確かめた)。`\pgfdeclareshape` は WASM の
 * TeX でも通り、**足のアンカーが節点ごと回る**ので、回した図でも配線が
 * 正しい足に付く。
 *
 * **形は足の数ごとに 1 つ宣言する。** 足の数を register で持たせると、
 * アンカーの位置を使う側で数え直すことになる — 図に出てくる数だけ
 * 宣言するほうが読みやすく、書き出す `.tex` もそのまま組める。
 *
 * アンカーは 2 通り: `pin K` が足の先 (配線が付く)、`bpin K` が箱の縁
 * (番号を書く場所)。circuitikz の `dipchip` と同じ呼び方に揃えてある。
 */

/** 足の間隔と箱の大きさ (cm)。**DIP と同じ見た目**に揃えてある。 */
const STEP = 0.5;
const HALF_WIDTH = 0.55;
const LEAD = 0.4;

/** その本数の足の高さ (箱の中心から測る)。 */
const halfHeightOf = (pins: number): number => (pins * STEP) / 2;

/** 足 K (1 始まり) の高さ。1 番が上で、下へ数える (DIP と同じ回り方)。 */
const pinYOf = (pins: number, at: number): number =>
  halfHeightOf(pins) - STEP / 2 - STEP * (at - 1);

/** その本数の記号の名前。**部品の `symbol` と同じ字**にする。 */
export const sipShapeName = (pins: number): string => `sip${pins}`;

/**
 * 記号 1 つぶんの宣言。**使う本数のぶんだけ**前口上に書く
 * (読める数だけ書く。約束 6 と同じ考え方)。
 */
export function sipShapeTex(pins: number): string[] {
  const half = halfHeightOf(pins);
  const legs = Array.from({ length: pins }, (_, index) => index + 1);

  const anchors = legs.flatMap((at) => {
    const y = pinYOf(pins, at);
    return [
      `  \\anchor{pin ${at}}{\\pgfpoint{${num(-HALF_WIDTH - LEAD)}cm}{${num(y)}cm}}`,
      `  \\anchor{bpin ${at}}{\\pgfpoint{${num(-HALF_WIDTH)}cm}{${num(y)}cm}}`,
    ];
  });

  const leads = legs.map((at) => {
    const y = pinYOf(pins, at);
    return `    \\pgfpathmoveto{\\pgfpoint{${num(-HALF_WIDTH - LEAD)}cm}{${num(y)}cm}}`
      + `\\pgfpathlineto{\\pgfpoint{${num(-HALF_WIDTH)}cm}{${num(y)}cm}}`;
  });

  return [
    '\\makeatletter',
    `\\pgfdeclareshape{${sipShapeName(pins)}}{`,
    '  \\anchor{center}{\\pgfpointorigin}',
    '  \\anchor{text}{\\pgfpointorigin}',
    ...anchors,
    '  \\backgroundpath{',
    `    \\pgfpathrectanglecorners{\\pgfpoint{${num(-HALF_WIDTH)}cm}{${num(-half)}cm}}`
      + `{\\pgfpoint{${num(HALF_WIDTH)}cm}{${num(half)}cm}}`,
    ...leads,
    '  }',
    '}',
    '\\makeatother',
  ];
}
