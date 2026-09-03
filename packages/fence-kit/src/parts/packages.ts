import { element } from '../markup.ts';
import { num } from '../svg.ts';
import type { BodyInk, BodyPart } from './bodies.ts';
import { REAL_INK } from './bodies.ts';

/**
 * **足が 3 本以上ある部品のパッケージの姿**。2 本足の胴 (`bodies.ts`) と同じ理由で
 * 板に依らないので、breadboard と perfboard が共有する (52 の docs/18 の手順 4)。
 *
 * **座標は板の座標そのまま** — 2 本足と違って傾かない (パッケージは穴の並びに
 * 沿って置かれる) ので、中心と大きさを渡して描く。
 *
 * **どちら側に寄せるかだけは板が決める** (`side`)。breadboard は溝の側へ、
 * perfboard は行の増える向きへ。タブとキャプションがそちら、ピン名と平らな面が
 * その反対に来る。
 */

/**
 * パッケージの置き場。`side` は**キャプションとタブを置く向き** (1 = 下)。
 * ピン名と、TO-92 の平らな面はその反対側に来る — 印と字が重ならないように。
 */
export type PackageShape = {
  readonly cx: number;
  readonly cy: number;
  /** 胴の高さの半分。 */
  readonly reach: number;
  /** 胴の幅の半分。 */
  readonly halfWidth: number;
  readonly side: 1 | -1;
  /** ねじ穴を抜く色 (板の地)。**下の穴の並びと紛れないように**板の色で抜く。 */
  readonly plate: string;
  /** 胴の色 (テーマが決める黒)。 */
  readonly chipBody: string;
};

/**
 * 胴の高さの半分。**穴のピッチで決める** — 実物の寸法をピッチに対する比で
 * 持っておくと、板が変わっても同じ大きさに見える。
 */
export function packageReach(part: BodyPart, pitch: number): number {
  if (part.type === 'potentiometer') return 1.1 * pitch;
  if (part.type === 'slide-switch') return 0.8 * pitch;
  // TO-220 は放熱タブのぶん胴が高い。実物 (10mm 角ほど) に寄せて丸より大きく取る。
  if (part.variant === 'to220') return 1.4 * pitch;
  // 変換基板は SOT-23 の胴よりずっと大きい (ピンヘッダを載せる板そのもの)。
  if (part.variant === 'sot23-dip') return 1.05 * pitch;
  // TO-92 は幅 4.5mm ほど。穴のピッチ 2.54mm に対して直径 2 ピッチ弱に収める。
  return 0.95 * pitch;
}

/**
 * 胴の横幅の半分。**丸い TO-92 以外は縦より横に広い**。
 * 配線がよける領域と描画の両方がここから幅を取る。**係数を 2 か所に持たない**:
 * 分けて持っていたころは障害物だけが丸の半径のままで、横に広い胴の上を配線が
 * 通っていた。
 */
export function packageHalfWidth(part: BodyPart, pitch: number): number {
  const reach = packageReach(part, pitch);
  if (part.type === 'potentiometer') return reach * 1.2;
  if (part.type === 'slide-switch') return reach * 1.6;
  if (part.variant === 'to220') return reach * 1.15;
  if (part.variant === 'sot23-dip') return reach * 1.35;
  return reach;
}

/** つまみが走る溝の幅。胴の内側に収めて、端で切れないようにする。 */
const SLOT_WIDTH_RATIO = 0.6875;

/**
 * パッケージの胴。種類と姿で選ぶ。知らない組み合わせは TO-92 の丸。
 */
export function drawPackage(part: BodyPart, shape: PackageShape, ink: BodyInk = REAL_INK): string {
  if (part.type === 'potentiometer') return potentiometerShell(shape, ink);
  if (part.type === 'slide-switch') return slideSwitchShell(shape, ink);
  if (part.variant === 'to220') return to220Shell(shape, ink);
  if (part.variant === 'sot23-dip') return adapterShell(shape, ink);
  return to92Shell(shape, ink);
}

/**
 * TO-92。上から見ると**片側が平らな D 形**で、足はその平らな面の側に並ぶ。
 * 丸だけで描くと**どちらが平らな面か分からず**、実物を差すときに裏返せてしまう
 * (ピン名は図には書いてあるが、実物の胴には書いていない — 見分けは平らな面が本体)。
 */
function to92Shell(shape: PackageShape, ink: BodyInk): string {
  const { cx, cy, reach, side } = shape;
  // 平らな面はピン名の側 (キャプションの反対)。
  const flatY = cy - side * reach * 0.62;
  const half = Math.sqrt(Math.max(reach * reach - (reach * 0.62) ** 2, 0));
  const body = element('circle', {
    cx: num(cx), cy: num(cy), r: num(reach), fill: ink.paint(shape.chipBody), stroke: ink.paint('#14171c'),
  });
  const flat = element('rect', {
    // 平らな面の内側 (胴の中心に向かう側) を塗って、丸を D 形に落とす。
    x: num(cx - half), y: num(side > 0 ? flatY : flatY - reach * 0.38),
    width: num(half * 2), height: num(reach * 0.38),
    fill: ink.paint(shape.chipBody), stroke: 'none',
  });
  const edge = element('line', {
    x1: num(cx - half), y1: num(flatY), x2: num(cx + half), y2: num(flatY),
    stroke: ink.paint('#14171c'), 'stroke-width': 1.4,
  });
  return body + flat + edge;
}

/**
 * TO-220。放熱タブつきの角い胴で、TO-92 の丸とは大きさも形も違う。
 * **タブは足の反対側に描く**: 足の側にはピン名が並ぶため。
 */
function to220Shell(shape: PackageShape, ink: BodyInk): string {
  const { cx, cy, reach, halfWidth, side } = shape;
  const tabHeight = reach * 0.8;
  const tabY = side > 0 ? cy + reach - tabHeight : cy - reach;

  const plastic = element('rect', {
    x: num(cx - halfWidth), y: num(cy - reach), width: num(halfWidth * 2), height: num(reach * 2), rx: 3,
    fill: ink.paint('#23272e'), stroke: ink.paint('#12151a'),
  });
  const tab = element('rect', {
    x: num(cx - halfWidth), y: num(tabY), width: num(halfWidth * 2), height: num(tabHeight), rx: 2,
    fill: ink.paint('#b9c0c9'), stroke: ink.paint('#7c848e'),
  });
  // 取り付けねじの穴。板の色で抜くと、下の穴の並びと紛れない。
  const hole = element('circle', {
    cx: num(cx), cy: num(tabY + tabHeight / 2), r: num(reach * 0.2), fill: ink.paint(shape.plate),
  });
  return plastic + tab + hole;
}

/**
 * 面実装の部品を載せた**変換基板**。実物の作り方そのもの — SOT-23 の足の間隔は
 * 0.95mm で、2.54mm の穴には届かないので、変換基板に載せてから差す。
 *
 * **描くのは基板ごと 1 つの部品**。小さな板の上に面実装の胴が乗り、下の縁から
 * ピンヘッダが出る (足はそのピンヘッダの位置)。
 */
function adapterShell(shape: PackageShape, ink: BodyInk): string {
  const { cx, cy, reach, halfWidth, side } = shape;
  const board = element('rect', {
    x: num(cx - halfWidth), y: num(cy - reach), width: num(halfWidth * 2), height: num(reach * 2), rx: 2,
    fill: ink.paint('#1f6b45'), stroke: ink.paint('#124a2b'),
  });
  // 白いシルク (変換基板の見分けどころ)。
  const silk = element('rect', {
    x: num(cx - halfWidth + 2), y: num(cy - reach + 2),
    width: num(Math.max(halfWidth * 2 - 4, 1)), height: num(Math.max(reach * 2 - 4, 1)), rx: 1.5,
    fill: 'none', stroke: ink.paint('#dfe4ee'), 'stroke-width': 0.8,
  });
  // 面実装の胴と、その両側から出るガルウィングの足。
  const chipHalf = reach * 0.42;
  const chip = element('rect', {
    x: num(cx - chipHalf * 1.3), y: num(cy - chipHalf), width: num(chipHalf * 2.6), height: num(chipHalf * 2), rx: 1,
    fill: ink.paint('#23272e'), stroke: ink.paint('#12151a'),
  });
  const legs = [-1, 1]
    .map((at) => element('line', {
      x1: num(cx + at * chipHalf * 1.3), y1: num(cy),
      x2: num(cx + at * chipHalf * 1.9), y2: num(cy),
      stroke: ink.paint('#b9c0c9'), 'stroke-width': 1.4,
    }))
    .join('');
  // ピンヘッダの列 (足の並ぶ側の縁)。
  const headerY = side > 0 ? cy - reach + 2.5 : cy + reach - 2.5;
  const header = element('rect', {
    x: num(cx - halfWidth + 1.5), y: num(headerY - 1.5),
    width: num(Math.max(halfWidth * 2 - 3, 1)), height: 3, rx: 1.5,
    fill: ink.paint('#2b2f33'),
  });
  return board + silk + chip + legs + header;
}

/** 半固定抵抗。上から見た四角い本体と、回すためのねじの頭。 */
function potentiometerShell(shape: PackageShape, ink: BodyInk): string {
  const { cx, cy, reach, halfWidth } = shape;
  const shell = element('rect', {
    x: num(cx - halfWidth), y: num(cy - reach), width: num(halfWidth * 2), height: num(reach * 2), rx: 3,
    fill: ink.paint('#2b6fd4'), stroke: ink.paint('#1b4a91'),
  });
  const head = element('circle', {
    cx: num(cx), cy: num(cy), r: num(reach * 0.6), fill: ink.paint('#dfe4ee'), stroke: ink.paint('#8a929c'),
  });
  const slot = element('rect', {
    x: num(cx - reach * 0.45), y: num(cy - 1.6), width: num(reach * 0.9), height: 3.2, rx: 1.2,
    fill: ink.paint('#5a6472'),
  });
  return shell + head + slot;
}

/**
 * スライドスイッチ。**つまみは真ん中に描く**:
 * どちらに倒して使うかは図では決まらないので、片側に寄せると嘘になる。
 */
function slideSwitchShell(shape: PackageShape, ink: BodyInk): string {
  const { cx, cy, reach, halfWidth } = shape;
  const shell = element('rect', {
    x: num(cx - halfWidth), y: num(cy - reach), width: num(halfWidth * 2), height: num(reach * 2), rx: 3,
    fill: ink.paint('#e8ebf0'), stroke: ink.paint('#8a929c'),
  });
  const slotHalf = halfWidth * SLOT_WIDTH_RATIO;
  const slot = element('rect', {
    x: num(cx - slotHalf), y: num(cy - 5), width: num(slotHalf * 2), height: 10, rx: 5,
    fill: ink.paint('#3f4650'),
  });
  const knob = element('rect', {
    x: num(cx - 5), y: num(cy - 7.5), width: 10, height: 15, rx: 2,
    fill: ink.paint('#b9bec7'), stroke: ink.paint('#6b7280'),
  });
  return shell + slot + knob;
}
