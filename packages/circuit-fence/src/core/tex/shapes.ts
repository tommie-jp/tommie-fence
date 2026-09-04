import { num } from './num.ts';

/**
 * circuitikz に無くて、**この拡張が自分で宣言する記号**の置き場。
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

/**
 * ピンヘッダ (`sipN`)。回路図のヘッダは「箱の片側に足が並ぶ」形。
 *
 * 足の間隔と箱の大きさ (cm)。**DIP と同じ見た目**に揃えてある。
 */
const STEP = 0.5;
const HALF_WIDTH = 0.55;
const LEAD = 0.4;

/** その本数の足の高さ (箱の中心から測る)。 */
const halfHeightOf = (pins: number): number => (pins * STEP) / 2;

/** 足 K (1 始まり) の高さ。1 番が上で、下へ数える (DIP と同じ回り方)。 */
const pinYOf = (pins: number, at: number): number =>
  halfHeightOf(pins) - STEP / 2 - STEP * (at - 1);

/**
 * 箱の四辺のアンカー。**宣言しないと `\node ... at (U.south)` が中心に落ちる**
 * (実機で、型番が箱の真ん中に重なって気づいた)。値を記号の下に出す道
 * (`underAnchor`) が回した向きに応じて 4 つとも使う。
 */
const edgeAnchors = (halfWidth: number, halfHeight: number): string[] => [
  `  \\anchor{north}{\\pgfpoint{0cm}{${num(halfHeight)}cm}}`,
  `  \\anchor{south}{\\pgfpoint{0cm}{${num(-halfHeight)}cm}}`,
  `  \\anchor{east}{\\pgfpoint{${num(halfWidth)}cm}{0cm}}`,
  `  \\anchor{west}{\\pgfpoint{${num(-halfWidth)}cm}{0cm}}`,
];

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
    ...edgeAnchors(HALF_WIDTH, half),
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

/**
 * 三端子レギュレータ (`regulator`)。**箱の左から入り、右から出て、下が
 * グラウンド**という回路図の慣習どおりの形。circuitikz に無いので宣言する。
 *
 * 足はどれも**中心線に乗る** (左右は横の中心線、下は縦の中心線) ので、
 * `--` でまっすぐ引ける。番号は実物の TO-220 と同じ 1=IN / 2=GND / 3=OUT。
 */
// **字 3 つと型番が中に収まる大きさ。** 詰めると `IN` と `OUT` が型番に
// 重なる (実機で焼いて決めた)。
const REG_HALF_WIDTH = 0.95;
const REG_HALF_HEIGHT = 0.62;
const REG_LEAD = 0.4;

export const REGULATOR_SHAPE = 'reg3';

export function regulatorShapeTex(): string[] {
  const [w, h, lead] = [REG_HALF_WIDTH, REG_HALF_HEIGHT, REG_LEAD];
  const legs: readonly (readonly [number, number, number, number, number])[] = [
    // [アンカー番号, 足の先 x, 足の先 y, 箱の縁 x, 箱の縁 y]
    [1, -w - lead, 0, -w, 0],
    [2, 0, -h - lead, 0, -h],
    [3, w + lead, 0, w, 0],
  ];

  return [
    '\\makeatletter',
    `\\pgfdeclareshape{${REGULATOR_SHAPE}}{`,
    '  \\anchor{center}{\\pgfpointorigin}',
    '  \\anchor{text}{\\pgfpointorigin}',
    ...edgeAnchors(w, h),
    ...legs.flatMap(([at, px, py, bx, by]) => [
      `  \\anchor{pin ${at}}{\\pgfpoint{${num(px)}cm}{${num(py)}cm}}`,
      `  \\anchor{bpin ${at}}{\\pgfpoint{${num(bx)}cm}{${num(by)}cm}}`,
    ]),
    '  \\backgroundpath{',
    `    \\pgfpathrectanglecorners{\\pgfpoint{${num(-w)}cm}{${num(-h)}cm}}`
      + `{\\pgfpoint{${num(w)}cm}{${num(h)}cm}}`,
    ...legs.map(([, px, py, bx, by]) =>
      `    \\pgfpathmoveto{\\pgfpoint{${num(px)}cm}{${num(py)}cm}}`
      + `\\pgfpathlineto{\\pgfpoint{${num(bx)}cm}{${num(by)}cm}}`),
    '  }',
    '}',
    '\\makeatother',
  ];
}
