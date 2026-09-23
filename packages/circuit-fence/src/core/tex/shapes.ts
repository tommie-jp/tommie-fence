import { lookupConnector } from 'fence-kit';
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
export const sipShapeTex = (pins: number): string[] =>
  headerShapeTex(sipShapeName(pins), pins, HALF_WIDTH, SIP_NUMBER_AREA);

/** ピンヘッダの足の番号 (2 桁まで) が占める幅。中の値はその右の真ん中に置く。 */
const SIP_NUMBER_AREA = 0.3;

/**
 * 板の外の機器・モジュール (`device`)。**ピンヘッダと同じ「箱の片側に足」の形**で、
 * 左の縁に足の名前、その右に機器の名前を刷る。**幅は名前の長さから決める** —
 * 決め打ちの幅だと、`ECHO` と `HC-SR04` が重なり、`Analog Discovery` は縁から
 * はみ出した (実機で焼いて確かめた)。
 *
 * 字の幅は見積もり (cm / 字)。足の名前は `\tiny`、機器の名前は `\scriptsize`。
 */
const PIN_NAME_CHAR = 0.1;
const LABEL_CHAR = 0.15;
/** 足の名前の列の左右の余白と、機器の名前の左右の余白。 */
const PIN_NAME_PAD = 0.2;
const LABEL_PAD = 0.25;
const DEVICE_MIN_HALF_WIDTH = 0.8;

/** 機器の箱の寸法 (cm)。**足の本数・半幅・足の名前の列の幅**で形が決まる。 */
export type DeviceBox = { readonly pins: number; readonly halfWidth: number; readonly nameArea: number };

/** 0.1 cm に切り上げる (形の名前に載せるので、細かい違いで形を増やさない)。 */
const tenthsUp = (length: number): number => Math.ceil(length * 10 - 1e-9) / 10;

export function deviceBox(names: readonly string[], label: string | null): DeviceBox {
  const nameArea = tenthsUp(PIN_NAME_PAD + Math.max(0, ...names.map((name) => [...name].length)) * PIN_NAME_CHAR);
  const labelArea = label === null ? 0 : [...label].length * LABEL_CHAR + LABEL_PAD * 2;
  return { pins: names.length, halfWidth: tenthsUp(Math.max(DEVICE_MIN_HALF_WIDTH, (nameArea + labelArea) / 2)), nameArea };
}

/** 形の名前。**寸法が違えば別の形**にする (TeX の形は寸法を引数に取れない)。 */
export const deviceShapeName = (box: DeviceBox): string =>
  `dev${box.pins}w${Math.round(box.halfWidth * 10)}n${Math.round(box.nameArea * 10)}`;

export const deviceShapeTex = (box: DeviceBox): string[] =>
  headerShapeTex(deviceShapeName(box), box.pins, box.halfWidth, box.nameArea);

/**
 * 片側に足が並ぶ箱。ピンヘッダと機器が幅だけ違えて使う。`nameArea` は左の縁で
 * 足の名前 (番号) が占める幅で、中の字 (値) はその右の残りの真ん中に置く。
 */
function headerShapeTex(name: string, pins: number, halfWidth: number, nameArea: number): string[] {
  const half = halfHeightOf(pins);
  const legs = Array.from({ length: pins }, (_, index) => index + 1);

  const anchors = legs.flatMap((at) => {
    const y = pinYOf(pins, at);
    return [
      `  \\anchor{pin ${at}}{\\pgfpoint{${num(-halfWidth - LEAD)}cm}{${num(y)}cm}}`,
      `  \\anchor{bpin ${at}}{\\pgfpoint{${num(-halfWidth)}cm}{${num(y)}cm}}`,
    ];
  });

  const leads = legs.map((at) => {
    const y = pinYOf(pins, at);
    return `    \\pgfpathmoveto{\\pgfpoint{${num(-halfWidth - LEAD)}cm}{${num(y)}cm}}`
      + `\\pgfpathlineto{\\pgfpoint{${num(-halfWidth)}cm}{${num(y)}cm}}`;
  });

  return [
    '\\makeatletter',
    `\\pgfdeclareshape{${name}}{`,
    '  \\anchor{center}{\\pgfpointorigin}',
    // **中の字は、足の名前の列の右に残る場所の真ん中に置く。** `text` は字の左下を
    // 置く点なので、原点のままだと字が右上へずれて縁からはみ出し、箱の真ん中に
    // 置くと足の名前に掛かった (実機で `HC-SR04` と `UART` を焼いて確かめた)。
    `  \\anchor{text}{\\pgfpoint{${num(nameArea / 2)}cm-.5\\wd\\pgfnodeparttextbox}{-.5\\ht\\pgfnodeparttextbox}}`,
    ...edgeAnchors(halfWidth, half),
    ...anchors,
    '  \\backgroundpath{',
    `    \\pgfpathrectanglecorners{\\pgfpoint{${num(-halfWidth)}cm}{${num(-half)}cm}}`
      + `{\\pgfpoint{${num(halfWidth)}cm}{${num(half)}cm}}`,
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

/**
 * 同軸コネクタ (`sma`)。**丸の中に中心導体、外周が外皮**という回路図の
 * 慣習どおりの形。circuitikz 1.0 に同軸コネクタの記号が無いので宣言する
 * (`coax` `plug` `socket` `jack` は無く、`bnc` は通るが線しか描かない。
 * 実機で確かめた)。
 *
 * 足は 2 本 — **1 が中心導体 (左から入る)、2 が外皮 (下へ出る)**。
 * 実物の SMA は外皮が 4 本足だが、図とネットリストで意味を持つのは
 * 「どこが中心でどこが外皮か」の 2 つだけ (実体配線図の 2 つと同じ決め方)。
 *
 * **外皮の丸は中心導体が入る側を開ける。** 閉じた丸にすると、中心導体の線が
 * 縁を横切って外皮と中心が繋がって見える (実機で「アースは中心に接続しない」と
 * 指摘された)。circuitikz 自身の `bnc` も同じで、足の出る側の丸を切り欠いて
 * 描いている (吐かせた SVG が丸をその帯で clip していた)。
 */
const SMA_RADIUS = 0.3;
const SMA_LEAD = 0.4;
const SMA_CORE = 0.07;
/** 外皮の丸を開ける角度 (中心導体の入る向きから上下へ、度)。 */
const SMA_GAP = 24;

export const SMA_SHAPE = 'smacoax';

/** 丸の上の点 (角度は度、真右が 0 度で反時計回り)。 */
const onCircle = (degrees: number, radius: number): string => {
  const radians = (degrees * Math.PI) / 180;
  return `\\pgfpoint{${num(radius * Math.cos(radians))}cm}{${num(radius * Math.sin(radians))}cm}`;
};

export function smaShapeTex(): string[] {
  const [r, lead] = [SMA_RADIUS, SMA_LEAD];
  // 中心導体は真横 (180 度) から入る。その前後を開けて、残りを弧で描く。
  const [from, to] = [180 + SMA_GAP, 180 - SMA_GAP + 360];
  return [
    '\\makeatletter',
    `\\pgfdeclareshape{${SMA_SHAPE}}{`,
    '  \\anchor{center}{\\pgfpointorigin}',
    '  \\anchor{text}{\\pgfpointorigin}',
    ...edgeAnchors(r, r),
    // 1 = 中心導体 (左)、2 = 外皮 (下)。
    `  \\anchor{pin 1}{\\pgfpoint{${num(-r - lead)}cm}{0cm}}`,
    `  \\anchor{pin 2}{\\pgfpoint{0cm}{${num(-r - lead)}cm}}`,
    `  \\anchor{bpin 1}{\\pgfpoint{${num(-r)}cm}{0cm}}`,
    `  \\anchor{bpin 2}{\\pgfpoint{0cm}{${num(-r)}cm}}`,
    '  \\backgroundpath{',
    // 外皮は中心導体の入る側を開けた弧。閉じた丸だと中心導体の線が縁を貫く。
    `    \\pgfpathmoveto{${onCircle(from, r)}}`,
    `    \\pgfpatharc{${from}}{${to}}{${num(r)}cm}`,
    // 中心導体は丸の真ん中まで引いて、先を塗り潰した点にする。
    `    \\pgfpathmoveto{\\pgfpoint{${num(-r - lead)}cm}{0cm}}\\pgfpathlineto{\\pgfpointorigin}`,
    // 外皮は丸の縁まで (中心には触れない)。
    `    \\pgfpathmoveto{\\pgfpoint{0cm}{${num(-r - lead)}cm}}\\pgfpathlineto{\\pgfpoint{0cm}{${num(-r)}cm}}`,
    '  }',
    '  \\foregroundpath{',
    `    \\pgfpathcircle{\\pgfpointorigin}{${num(SMA_CORE)}cm}`,
    '    \\pgfusepath{fill}',
    '  }',
    '}',
    '\\makeatother',
  ];
}

/**
 * USB コネクタ (`usb-a` / `usb-c`)。**箱の右に足が並び、左に差し込み口**という
 * 置き方 (KiCad の USB の記号と同じ)。circuitikz 1.0 にコネクタの記号は無いので
 * 宣言する。足の数は表の長さ (fence-kit。Type-A は 4 本、Type-C は 6 本) で、
 * 名前は箱の中に書く (`pinLabels`。字は SVG に差し込む — 約束 7)。
 *
 * **口の形で種類を見分ける** — 正面から見た穴の形で、Type-C は長丸、Type-A は
 * 角に舌が片側へ寄った形。回路図でオス・メスは描き分けない (足の意味は同じ)。
 *
 * 足はどれも**中心線に乗らない** (`pinRow`)。足の間隔と箱の縦はピンヘッダと同じ。
 */
const USB_HALF_WIDTH = 0.95;
const USB_LEAD = 0.4;
/** 口の中心。箱の左寄り (右半分は足の名前が入る)。 */
const USB_MOUTH_X = -0.5;

const USB_SHAPES: Readonly<Record<string, string>> = { 'usb-a': 'usbacon', 'usb-c': 'usbccon' };

/** その種類の記号の名前。USB でなければ null。 */
export const usbShapeName = (type: string): string | null =>
  (Object.hasOwn(USB_SHAPES, type) ? USB_SHAPES[type] ?? null : null);

const point = (x: number, y: number): string => `\\pgfpoint{${num(x)}cm}{${num(y)}cm}`;
const rectangle = (x0: number, y0: number, x1: number, y1: number): string =>
  `\\pgfpathrectanglecorners{${point(x0, y0)}}{${point(x1, y1)}}`;

/**
 * 差し込み口の輪郭 (線) と舌 (塗り)。Type-C は縦に長い長丸の中に細い舌、
 * Type-A は縦長の角の中に、片側へ寄った舌。
 */
function usbMouth(round: boolean): { readonly outline: string[]; readonly tongue: string } {
  const cx = USB_MOUTH_X;
  if (round) {
    const [r, straight] = [0.14, 0.34];
    return {
      outline: [
        `    \\pgfpathmoveto{${point(cx - r, -straight)}}`,
        `    \\pgfpathlineto{${point(cx - r, straight)}}`,
        `    \\pgfpatharc{180}{0}{${num(r)}cm}`,
        `    \\pgfpathlineto{${point(cx + r, -straight)}}`,
        `    \\pgfpatharc{0}{-180}{${num(r)}cm}`,
        '    \\pgfpathclose',
      ],
      tongue: rectangle(cx - 0.035, -0.26, cx + 0.035, 0.26),
    };
  }
  const [halfW, halfH] = [0.17, 0.44];
  return {
    outline: [`    ${rectangle(cx - halfW, -halfH, cx + halfW, halfH)}`],
    tongue: rectangle(cx - halfW + 0.05, -halfH + 0.09, cx - 0.01, halfH - 0.09),
  };
}

export function usbShapeTex(type: string): string[] {
  const name = usbShapeName(type);
  const pins = lookupConnector(type)?.pins.length ?? 0;
  if (name === null || pins === 0) return [];

  const [w, lead] = [USB_HALF_WIDTH, USB_LEAD];
  const half = halfHeightOf(pins);
  const legs = Array.from({ length: pins }, (_, index) => index + 1);
  const mouth = usbMouth(type === 'usb-c');

  return [
    '\\makeatletter',
    `\\pgfdeclareshape{${name}}{`,
    '  \\anchor{center}{\\pgfpointorigin}',
    '  \\anchor{text}{\\pgfpointorigin}',
    ...edgeAnchors(w, half),
    ...legs.flatMap((at) => [
      `  \\anchor{pin ${at}}{${point(w + lead, pinYOf(pins, at))}}`,
      `  \\anchor{bpin ${at}}{${point(w, pinYOf(pins, at))}}`,
    ]),
    '  \\backgroundpath{',
    `    ${rectangle(-w, -half, w, half)}`,
    ...legs.map((at) =>
      `    \\pgfpathmoveto{${point(w, pinYOf(pins, at))}}\\pgfpathlineto{${point(w + lead, pinYOf(pins, at))}}`),
    ...mouth.outline,
    '  }',
    '  \\foregroundpath{',
    `    ${mouth.tongue}`,
    '    \\pgfusepath{fill}',
    '  }',
    '}',
    '\\makeatother',
  ];
}
