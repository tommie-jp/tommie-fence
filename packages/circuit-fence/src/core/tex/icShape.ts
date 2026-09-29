import type { IcPinout, IcSide } from '../icLayouts.ts';
import { num } from './num.ts';

/**
 * 回路図の IC (`ic`) の箱。**4 辺に足**が出る (機器の箱は片側だけ、DIP は実物の
 * 並びで左右だけ)。どの足がどの辺かは働きの並び (`icLayouts.ts`) が決める。
 *
 * **足は箱の中心から半マス刻み**に置く (`icStepOf`)。箱の中心を番地に置けば
 * 足は半マスの番地 (`c8a5`) にちょうど乗るので、`-|` / `|-` で引いた線が
 * 折れずにまっすぐ届く。辺の中の足が偶数本なら、1 本目が中心に来て残りは
 * 右 (下) へ並ぶ — 中心に揃えて半刻みずらすと、番地に乗らなくなる。
 *
 * アンカーは DIP と同じ呼び方: `pin K` が足の先 (配線が付く)、`bpin K` が
 * 箱の縁 (足の名前を書く場所)。K は実物の足の番号。
 */
const LEAD = 0.4;
/** 足の間隔の範囲 (cm)。狭いと足の名前が重なり、広いと箱が間延びする。 */
const MIN_STEP = 0.4;
const MAX_STEP = 1;

/**
 * 足の間隔 (cm)。**半マス** (`pitch / 2`) を基本に、狭すぎれば 1 マス、
 * 広すぎれば 1/4 マスにする。どれでも番地の刻みに乗る。
 */
export function icStepOf(pitch: number): number {
  const half = pitch / 2;
  if (half < MIN_STEP) return pitch;
  return half > MAX_STEP ? pitch / 4 : half;
}
/** 足の名前と型番 (どちらも `\scriptsize`) の字の幅の見積もり (cm / 字)。 */
const PIN_CHAR = 0.14;
const MODEL_CHAR = 0.15;
const MODEL_HEIGHT = 0.3;
/** 縁から字まで、字と字の間、字の太さの半分、端の足から角まで。 */
const INSET = 0.1;
const GAP = 0.15;
const TEXT_HALF = 0.1;
const EDGE = 0.35;

export type IcPlace = {
  /** 実物の足の番号 (1 始まり)。 */
  readonly pin: number;
  readonly side: IcSide;
  /** 辺に沿った位置 (cm)。左右の辺は y (上が +)、上下の辺は x (右が +)。 */
  readonly along: number;
};

export type IcBox = {
  readonly name: string;
  readonly halfWidth: number;
  readonly halfHeight: number;
  /** 並びは上の辺 (左から)・左の辺 (上から)・右の辺 (上から)・下の辺 (左から)。 */
  readonly places: readonly IcPlace[];
};

const SIDES: readonly IcSide[] = ['top', 'left', 'right', 'bottom'];

/** 辺の中の k 番目 (0 始まり) の位置。左右の辺は上から、上下の辺は左から。 */
function alongOf(side: IcSide, count: number, index: number, step: number): number {
  const middle = Math.floor((count - 1) / 2);
  return side === 'left' || side === 'right' ? (middle - index) * step : (index - middle) * step;
}

/** 0.1 cm に切り上げる (形の寸法を細かく揺らさない)。 */
const tenthsUp = (length: number): number => Math.ceil(length * 10 - 1e-9) / 10;

/** 足に刷る字 (`7 DISCH`) の長さ。番号は桁を揃える (名前付きの DIP と同じ)。 */
const labelLength = (name: string, digits: number): number => digits + 1 + [...name].length;

export function icBox(pinout: IcPinout, step: number): IcBox {
  const digits = String(pinout.names.length).length;
  const numberOf = (name: string): number => pinout.names.indexOf(name) + 1;
  const places = SIDES.flatMap((side) => pinout.layout[side].map((name, index, row) => ({
    pin: numberOf(name), side, along: alongOf(side, row.length, index, step),
  })));

  // 辺ごとの字の列の幅 (左右は横に、上下は縦に伸びる)。
  const column = (side: IcSide): number =>
    Math.max(0, ...pinout.layout[side].map((name) => labelLength(name, digits))) * PIN_CHAR;
  const acrossX = places.filter((place) => place.side === 'top' || place.side === 'bottom').map((place) => place.along);
  const acrossY = places.filter((place) => place.side === 'left' || place.side === 'right').map((place) => place.along);
  const modelHalf = ([...pinout.model].length * MODEL_CHAR) / 2;

  const halfWidth = Math.max(
    // 上下の足の縦書きの名前が、左右の列の字に掛からない。
    ...(acrossX.length === 0 ? [] : [
      INSET + column('left') + GAP + TEXT_HALF - Math.min(...acrossX),
      INSET + column('right') + GAP + TEXT_HALF + Math.max(...acrossX),
    ]),
    // 真ん中の型番が左右の列の字に掛からない。
    INSET + Math.max(column('left'), column('right')) + GAP + modelHalf,
    ...acrossX.map((x) => Math.abs(x) + EDGE),
  );
  const halfHeight = Math.max(
    // 上下の縦書きの名前が、真ん中の型番に掛からない。
    INSET + column('top') + GAP + MODEL_HEIGHT / 2,
    INSET + column('bottom') + GAP + MODEL_HEIGHT / 2,
    ...acrossY.map((y) => Math.abs(y) + EDGE),
  );
  // **間隔が違えば別の形** (TeX の形は寸法を引数に取れない)。
  return { name: `ic${pinout.model}s${Math.round(step * 1000)}`, halfWidth: tenthsUp(halfWidth), halfHeight: tenthsUp(halfHeight), places };
}

/** 足の先と、箱の縁の点 (cm)。 */
function pinPoints(box: IcBox, place: IcPlace): { readonly tip: readonly [number, number]; readonly edge: readonly [number, number] } {
  const { halfWidth: w, halfHeight: h } = box;
  const a = place.along;
  if (place.side === 'left') return { tip: [-w - LEAD, a], edge: [-w, a] };
  if (place.side === 'right') return { tip: [w + LEAD, a], edge: [w, a] };
  if (place.side === 'top') return { tip: [a, h + LEAD], edge: [a, h] };
  return { tip: [a, -h - LEAD], edge: [a, -h] };
}

const point = ([x, y]: readonly [number, number]): string => `\\pgfpoint{${num(x)}cm}{${num(y)}cm}`;

/** 形の宣言。**使う型番のぶんだけ**前口上に書く (機器の箱と同じ)。 */
export function icShapeTex(box: IcBox): string[] {
  const { halfWidth: w, halfHeight: h } = box;
  const legs = box.places.map((place) => ({ pin: place.pin, ...pinPoints(box, place) }));
  return [
    '\\makeatletter',
    `\\pgfdeclareshape{${box.name}}{`,
    '  \\anchor{center}{\\pgfpointorigin}',
    // 型番は箱の真ん中。`text` は字の左下を置く点なので半分ずつ戻す。
    '  \\anchor{text}{\\pgfpoint{-.5\\wd\\pgfnodeparttextbox}{-.5\\ht\\pgfnodeparttextbox}}',
    `  \\anchor{north}{${point([0, h])}}`,
    `  \\anchor{south}{${point([0, -h])}}`,
    `  \\anchor{east}{${point([w, 0])}}`,
    `  \\anchor{west}{${point([-w, 0])}}`,
    `  \\anchor{north west}{${point([-w, h])}}`,
    ...legs.flatMap((leg) => [
      `  \\anchor{pin ${leg.pin}}{${point(leg.tip)}}`,
      `  \\anchor{bpin ${leg.pin}}{${point(leg.edge)}}`,
    ]),
    '  \\backgroundpath{',
    `    \\pgfpathrectanglecorners{${point([-w, -h])}}{${point([w, h])}}`,
    ...legs.map((leg) => `    \\pgfpathmoveto{${point(leg.tip)}}\\pgfpathlineto{${point(leg.edge)}}`),
    '  }',
    '}',
    '\\makeatother',
  ];
}

/** 足の出る辺だけ (間隔に依らない)。並びは `icBox` の `places` と同じ。 */
export const icSides = (pinout: IcPinout): readonly { readonly pin: number; readonly side: IcSide }[] =>
  SIDES.flatMap((side) => pinout.layout[side].map((name) => ({ pin: pinout.names.indexOf(name) + 1, side })));
