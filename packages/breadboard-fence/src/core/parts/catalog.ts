/**
 * 置ける部品の**和名と ID の接頭辞**。マップのパレットが引く。
 *
 * **和名は circuit-fence と揃える。** 同じノートで両方を書く人が、呼び方を
 * 覚え直さなくてよいようにするため (README がその約束を書いている)。
 *
 * **接頭辞は docs と examples の例に合わせる。** 表を先に決めて例を直すのでは
 * なく、既に書いてある図の ID を集めて起こしてある (`R1` は抵抗、`D1` は
 * ダイオードの仲間、`SW1` はスイッチ)。
 */

import { lookupFootprint, placeableTypes } from '../placement/footprints.ts';

/**
 * 置ける種類の名前。**一覧そのものは `footprints.ts` が正** — 足の数を決めて
 * いるのがあちらなので、こちらに写しを持つと種類を足したとき片方が古くなる。
 * ここに要るのは「その名前に和名と接頭辞があるか」だけ (テストが両方向を見張る)。
 */
export type PlaceableName =
  | 'resistor' | 'capacitor' | 'led' | 'diode' | 'buzzer' | 'crystal' | 'inductor'
  | 'photoresistor' | 'thermistor' | 'thermistor-ntc' | 'thermistor-ptc' | 'varistor'
  | 'zener' | 'schottky' | 'photodiode' | 'varicap' | 'diac'
  | 'reed' | 'fuse' | 'lamp'
  | 'transistor' | 'potentiometer' | 'slide-switch' | 'thyristor' | 'triac'
  | 'button';

export const PLACEABLE = placeableTypes;

/** 和名。**種類を足したら型エラーでここも要求される。** */
export const PART_NAMES: Readonly<Record<PlaceableName, string>> = {
  resistor: '抵抗',
  capacitor: 'コンデンサ',
  led: 'LED',
  diode: 'ダイオード',
  buzzer: 'ブザー',
  crystal: '水晶振動子',
  inductor: 'コイル',
  photoresistor: 'CdS セル',
  thermistor: 'サーミスタ',
  'thermistor-ntc': 'NTC サーミスタ',
  'thermistor-ptc': 'PTC サーミスタ',
  varistor: 'バリスタ',
  zener: 'ツェナー',
  schottky: 'ショットキー',
  photodiode: 'フォトダイオード',
  varicap: 'バリキャップ',
  diac: 'ダイアック',
  reed: 'リードスイッチ',
  fuse: 'ヒューズ',
  lamp: 'ランプ',
  transistor: 'トランジスタ',
  potentiometer: 'ポテンショメータ',
  'slide-switch': 'スライドスイッチ',
  thyristor: 'サイリスタ (SCR)',
  triac: 'トライアック',
  button: 'タクトスイッチ',
};

/**
 * ID の接頭辞。**番号は接頭辞ごとに最小の未使用**を使う
 * (`D1` が LED なら、次のダイオードは `D2`)。種類ごとに数えると、
 * 同じ接頭辞で番号が重なる。
 */
export const PART_PREFIXES: Readonly<Record<PlaceableName, string>> = {
  resistor: 'R',
  capacitor: 'C',
  led: 'D',
  diode: 'D',
  buzzer: 'BZ',
  crystal: 'X',
  inductor: 'L',
  photoresistor: 'R',
  thermistor: 'R',
  'thermistor-ntc': 'R',
  'thermistor-ptc': 'R',
  varistor: 'R',
  zener: 'D',
  schottky: 'D',
  photodiode: 'D',
  varicap: 'D',
  diac: 'D',
  reed: 'SW',
  fuse: 'F',
  lamp: 'LP',
  transistor: 'Q',
  potentiometer: 'VR',
  'slide-switch': 'SW',
  thyristor: 'T',
  triac: 'T',
  button: 'SW',
};

/**
 * その種類に書く穴の数。**形が決める** (`footprints.ts`)。
 *
 * - 2 本足 → 2 つ (交点から交点へドラッグする)
 * - 3 本足 → 3 つ
 * - タクトスイッチ → **アンカー 1 つ** (`@ e5`。足の位置はパッケージが決める)
 */
export function holesOf(type: string): number {
  const footprint = lookupFootprint(type);
  if (footprint === null) return 0;
  if (footprint.kind === 'two-lead') return 2;
  return footprint.kind === 'three-lead' ? 3 : 1;
}

/** 2 端子か (交点から交点へドラッグする。ほかは 1 回の押しで置く)。 */
export const isTwoLead = (type: string): boolean => holesOf(type) === 2;

/** アンカー 1 つで置く形か (`@ 穴` と書く)。 */
export const isAnchored = (type: string): boolean => {
  const footprint = lookupFootprint(type);
  return footprint !== null && (footprint.kind === 'switch' || footprint.kind === 'dip' || footprint.kind === 'sip');
};

export const isPlaceable = (type: string): type is PlaceableName =>
  placeableTypes().includes(type);
