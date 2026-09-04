import { lookupBoardPart } from 'fence-kit';
import { footprintOf } from './footprint.ts';
import { placeableNames } from './types.ts';

/**
 * 置ける部品の**和名と ID の接頭辞**。マップのパレットが引く。
 *
 * **和名は circuit-fence / breadboard-fence と揃える。** 同じノートで
 * 2 つ以上のフェンスを書く人が、呼び方を覚え直さなくてよいようにするため。
 *
 * **一覧そのものは `types.ts` が正** (足の数を決めているのがあちら)。
 * ここに写しを持つと、種類を足したとき片方が古くなる。
 */

export type PlaceableName =
  | 'resistor' | 'capacitor' | 'led' | 'diode' | 'inductor' | 'crystal' | 'buzzer'
  | 'photoresistor' | 'thermistor' | 'thermistor-ntc' | 'thermistor-ptc' | 'varistor'
  | 'zener' | 'schottky' | 'photodiode' | 'varicap' | 'diac'
  | 'reed' | 'fuse' | 'lamp' | 'sma'
  | 'battery' | 'solar' | 'speaker' | 'mic' | 'switch' | 'switch-nc'
  | 'button' | 'button-nc'
  | 'transistor' | 'potentiometer' | 'thyristor' | 'triac' | 'slide-switch' | 'regulator';

/** 和名。**種類を足したら型エラーでここも要求される。** */
export const PART_NAMES: Readonly<Record<PlaceableName, string>> = {
  resistor: '抵抗',
  capacitor: 'コンデンサ',
  led: 'LED',
  diode: 'ダイオード',
  inductor: 'コイル',
  crystal: '水晶振動子',
  buzzer: 'ブザー',
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
  sma: 'SMA コネクタ',
  transistor: 'トランジスタ',
  potentiometer: 'ポテンショメータ',
  thyristor: 'サイリスタ (SCR)',
  triac: 'トライアック',
  'slide-switch': 'スライドスイッチ',
  regulator: '三端子レギュレータ',
  battery: '電池',
  solar: '太陽電池',
  speaker: 'スピーカー',
  mic: 'マイク',
  switch: 'スイッチ (a 接点)',
  'switch-nc': 'スイッチ (b 接点)',
  button: 'タクトスイッチ (a 接点)',
  'button-nc': 'タクトスイッチ (b 接点)',
};

/**
 * ID の接頭辞。**番号は接頭辞ごとに最小の未使用**を使う
 * (`D1` が LED なら、次のダイオードは `D2`)。
 */
export const PART_PREFIXES: Readonly<Record<PlaceableName, string>> = {
  resistor: 'R',
  capacitor: 'C',
  led: 'D',
  diode: 'D',
  inductor: 'L',
  crystal: 'X',
  buzzer: 'BZ',
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
  sma: 'J',
  transistor: 'Q',
  potentiometer: 'VR',
  thyristor: 'T',
  triac: 'T',
  'slide-switch': 'SW',
  regulator: 'U',
  battery: 'B',
  solar: 'PV',
  speaker: 'LS',
  mic: 'MK',
  switch: 'SW',
  'switch-nc': 'SW',
  button: 'SW',
  'button-nc': 'SW',
};

export const PLACEABLE = placeableNames;

const DIP_NAME = /^dip(\d+)$/;
const SIP_NAME = /^sip(\d+)$/;

/**
 * 人に見せる名前。**足を並べて書く部品は表から、パッケージ物は規則から**
 * (breadboard と同じ理由 — `dipN` はピン数がいくつでも読めるので、表に
 * 書き並べると「表に無い数」が名無しになる)。
 */
export function partName(type: string): string {
  const dip = DIP_NAME.exec(type);
  if (dip) return `DIP ${dip[1]} ピン`;
  const sip = SIP_NAME.exec(type);
  if (sip) return `ピンヘッダ ${sip[1]} ピン`;
  // マイコンボードは製品名 (**breadboard と同じ表**から出す)。
  return lookupBoardPart(type)?.name ?? (isPlaceable(type) ? PART_NAMES[type] : type);
}

/** ID の接頭辞。DIP は `U` (IC)、ピンヘッダは `J` (コネクタ)。 */
export function partPrefix(type: string): string | null {
  if (DIP_NAME.test(type) || lookupBoardPart(type) !== null) return 'U';
  if (SIP_NAME.test(type)) return 'J';
  return isPlaceable(type) ? PART_PREFIXES[type] : null;
}

/**
 * その種類に書く穴の数。**形が決める** (`footprint.ts`)。
 * 姿で変わるもの (端面実装の `sma` は 3 本) は、既定の姿の数を返す。
 */
export function holesOf(type: string): number {
  const footprint = footprintOf(type, null);
  return footprint === null ? 0 : (footprint.minHoles ?? footprint.holes);
}

/** 2 端子か (穴から穴へドラッグする。ほかは 1 回の押しで置く)。 */
export const isTwoLead = (type: string): boolean => holesOf(type) === 2;

export const isPlaceable = (type: string): type is PlaceableName => placeableNames().includes(type);
