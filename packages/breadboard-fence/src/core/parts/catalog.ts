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
import { lookupBoardPart } from 'fence-kit';

/**
 * 置ける種類の名前。**一覧そのものは `footprints.ts` が正** — 足の数を決めて
 * いるのがあちらなので、こちらに写しを持つと種類を足したとき片方が古くなる。
 * ここに要るのは「その名前に和名と接頭辞があるか」だけ (テストが両方向を見張る)。
 */
export type PlaceableName =
  | 'resistor' | 'capacitor' | 'led' | 'diode' | 'buzzer' | 'crystal' | 'inductor'
  | 'photoresistor' | 'thermistor' | 'thermistor-ntc' | 'thermistor-ptc' | 'varistor'
  | 'zener' | 'schottky' | 'photodiode' | 'varicap' | 'diac'
  | 'reed' | 'fuse' | 'lamp' | 'sma'
  | 'battery' | 'solar' | 'speaker' | 'mic' | 'switch' | 'switch-nc'
  | 'transistor' | 'potentiometer' | 'slide-switch' | 'thyristor' | 'triac'
  | 'regulator' | 'button' | 'button-nc';

export const PLACEABLE = placeableTypes;

const DIP_NAME = /^dip(\d+)$/;
const SIP_NAME = /^sip(\d+)$/;

/**
 * 人に見せる名前。**足を並べて書く部品は表から、パッケージ物は規則から**。
 *
 * `dipN` / `sipN` はピン数がいくつでも読める文法なので、表に書き並べると
 * 「表に無い数」が名無しになる (パレットに出していない `dip22` を欄に打つ、など)。
 * 規則で出せば、読める種類には必ず名前が付く。
 */
export function partName(type: string): string {
  const dip = DIP_NAME.exec(type);
  if (dip) return `DIP ${dip[1]} ピン`;
  const sip = SIP_NAME.exec(type);
  if (sip) return `ピンヘッダ ${sip[1]} ピン`;
  return lookupBoardPart(type)?.name ?? (isPlaceable(type) ? PART_NAMES[type] : type);
}

/**
 * ID の接頭辞。パッケージ物は規則で — DIP とマイコンボードは `U` (IC)、
 * ピンヘッダは `J` (コネクタ)。回路図の慣習に合わせてある。
 */
export function partPrefix(type: string): string | null {
  if (DIP_NAME.test(type) || lookupBoardPart(type) !== null) return 'U';
  if (SIP_NAME.test(type)) return 'J';
  return isPlaceable(type) ? PART_PREFIXES[type] : null;
}

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
  sma: 'SMA コネクタ',
  regulator: '三端子レギュレータ',
  button: 'タクトスイッチ (a 接点)',
  'button-nc': 'タクトスイッチ (b 接点)',
  battery: '電池',
  solar: '太陽電池',
  speaker: 'スピーカー',
  mic: 'マイク',
  switch: 'スイッチ (a 接点)',
  'switch-nc': 'スイッチ (b 接点)',
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
  sma: 'J',
  regulator: 'U',
  button: 'SW',
  'button-nc': 'SW',
  battery: 'B',
  solar: 'PV',
  speaker: 'LS',
  mic: 'MK',
  switch: 'SW',
  'switch-nc': 'SW',
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
