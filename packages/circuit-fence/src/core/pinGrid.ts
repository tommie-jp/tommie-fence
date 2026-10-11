/**
 * 片側にピンが並ぶ箱 (DIP・マイコンボード・機器・ピンヘッダ・7 セグ) のピンの刻み (52 の docs/128)。
 *
 * **刻みはマスの割合で決め、番地 (小数 2 桁) に乗る値だけを選ぶ。** 0.48 cm (circuitikz の
 * `dipchip` の既定) や 0.5 cm 決め打ちのままだと、ピンが番地の間に落ち、`-|` で引いた線が
 * ピンの手前で小さく折れた (06-fpga の 0-4 の図1、Pico 2 と AD3 の 3 本)。
 *
 * 選ぶのは 0.4 cm 以上で 0.5 cm に一番近い刻み。pitch 2 で 0.5 cm (今までの機器と同じ)、
 * 教科書の pitch 1.2 で 0.48 cm (今までの DIP と同じ)、pitch 1 で 0.5 cm。
 * 0.4 cm より詰めるとピンの名前 (`\scriptsize`) が上下で触れる。
 *
 * 働きで並べた IC (`ic`) は 4 辺に名前が並ぶので別の決め (`icStepOf`、半マス)。
 */
import type { Address } from './model/address.ts';
import type { PartType, Turn } from './parts.ts';

const FRACTIONS = [0.1, 0.2, 0.25, 0.4, 0.5, 1] as const;
const NOMINAL = 0.5;
const MIN_STEP = 0.4;

/** 刻み (cm)。**マスの割合が小数 2 桁で書ける**ので、ピンの行は必ず番地で書ける。 */
export function headerStepOf(pitch: number): number {
  const steps = FRACTIONS.map((fraction) => fraction * pitch).filter((step) => step >= MIN_STEP - 1e-9);
  // 0.4 cm 以上が 1 つも無いのは pitch 0.4 未満 (範囲の外) だけ。そのときは 1 マス。
  if (steps.length === 0) return pitch;
  return steps.reduce((best, step) => (Math.abs(step - NOMINAL) < Math.abs(best - NOMINAL) - 1e-9 ? step : best));
}

/**
 * 箱の中心から見たピンのずれ (刻みの単位)。**奇数本なら真ん中、偶数本なら上から
 * `floor((n−1)/2)` 本目 (0 始まり) を中心の高さ**に置く (`ic` の `alongOf` と同じ決め)。
 * 対称に並べると偶数本の箱のピンは半刻みの位置に落ち、番地に乗らない。
 */
export const evenShiftOf = (count: number): number => (count % 2 === 0 ? -0.5 : 0);

/**
 * 番地の刻みに乗った箱 (`pinGrid`) のピンが乗る**行か列**。横に出るピンなら行 (`h`)、
 * 寝かせた箱で縦に出るピンなら列 (`v`)。乗らない箱・知らないピンは null。
 *
 * 箱の中のピンは辺ごとに上から並ぶ (`pinRow` の並び。DIP の右の辺は下から番号が増える
 * ので、表のほうが上からの順に並べてある)。上から数えた位置から `floor((n−1)/2)` を引いた
 * 数だけ、刻みの単位で下にある。**回すと「下」も回る** — 時計回りに 90 度で左、180 度で上、
 * 270 度で右。反転 (`mirror`) は左右だけなので、ピンの並びの向きは変わらない。
 */
export function gridPinLine(
  type: PartType,
  anchor: string,
  turn: Turn,
  at: Address,
  pitch: number,
): { readonly axis: 'h' | 'v'; readonly value: number } | null {
  if (type.pinGrid !== true || type.pinRow === undefined) return null;
  const side = Object.hasOwn(type.pinRow, anchor) ? type.pinRow[anchor] : undefined;
  if (side === undefined) return null;
  const row = Object.keys(type.pinRow).filter((other) => type.pinRow?.[other] === side);
  const below = row.indexOf(anchor) - Math.floor((row.length - 1) / 2);
  const cells = (below * headerStepOf(pitch)) / pitch;
  if (turn.rotate === 0) return { axis: 'h', value: at.row + cells };
  if (turn.rotate === 180) return { axis: 'h', value: at.row - cells };
  return turn.rotate === 90 ? { axis: 'v', value: at.col - cells } : { axis: 'v', value: at.col + cells };
}
