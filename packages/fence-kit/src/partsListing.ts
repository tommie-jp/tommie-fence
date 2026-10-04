import { lookupRole } from './parts/pinouts.ts';
import { capacitorCode, parsePicofarads, parseResistor, resistorBands } from './values.ts';

/**
 * 部品表の欄の中身。breadboard と perfboard の部品表が**同じ欄を同じ字で**出すための置き場。
 * 表の組み方 (板に載せるか、等幅の帯にするか) はフェンスごとに違うので、ここには置かない。
 */

/**
 * 抵抗のカラーコードの帯の色 (`brown` など)。**値として読めないときは空** —
 * 実物と違う帯を書くと、図を信じた人が違う抵抗を挿す (図の帯と同じ約束)。
 * 表には字ではなく**実際の色の四角**で出す。
 */
export function bandColors(type: string, value: string | null): readonly string[] {
  if (type !== 'resistor' || value === null) return [];

  const read = parseResistor(value);
  if (read === null) return [];

  return resistorBands(read.ohms, { tolerance: read.tolerance, tempco: read.tempco }) ?? [];
}

/**
 * コンデンサの胴に刷ってある 3 桁の記号 (`100n` → `104`)。**電解は値をそのまま刷る**ので出さない。
 * 3 桁で書けない値 (10pF 未満・丸めると別の値) も出さない。
 */
export function capacitorMark(type: string, variant: string | null, value: string | null): string {
  if (type !== 'capacitor' || variant === 'electrolytic' || value === null) return '';

  const picofarads = parsePicofarads(value);
  return picofarads === null ? '' : capacitorCode(picofarads) ?? '';
}

/** 最後の欄。抵抗は帯の色の並び (四角で描く)、ほかは字 (コンデンサの記号 `104` など)。 */
export type PartsMark = string | readonly string[];

export const partsMark = (type: string, variant: string | null, value: string | null): PartsMark => {
  const bands = bandColors(type, value);
  return bands.length > 0 ? bands : capacitorMark(type, variant, value);
};

/** 部品表の見出し。番号と型番だけが並ぶと、どの欄が値なのかが読めない。 */
export const PARTS_HEADINGS = ['部品', '種類', '値', '色・記号'] as const;

/** 種類の欄に、綴り (`sip3`) の代わりに出す呼び名。 */
const CERAMIC_FILTER = 'セラミックフィルター';

/** 型番の働きの表 (pinouts) での書き出し。 */
const CERAMIC_ROLE = 'セラミックフィルタ';

/**
 * 種類の綴り。姿を書いてあれば添える (`capacitor/ceramic`)。セラミックフィルタの型番
 * (`sip3` + `SFU455B`) は、足の数の綴りでは何の部品か分からないので呼び名で出す。
 */
export function partKind(type: string, variant: string | null, value: string | null): string {
  const role = value === null || value === '' ? null : lookupRole(value);
  if (role?.startsWith(CERAMIC_ROLE) === true) return CERAMIC_FILTER;
  return variant === null ? type : `${type}/${variant}`;
}

/**
 * IC の型番に働きを添える (`CD4081 (2 入力 AND ×4)`)。型番だけだと、どの IC が何をするのか
 * 表から読めない。足の名前の表にある型番だけ。
 */
export function valueWithRole(value: string): string {
  const role = value === '' ? null : lookupRole(value);
  if (role === null) return value;
  // セラミックフィルタは種類の欄に呼び名を出すので、値の欄には周波数だけ残す (`SFU455B (455 kHz)`)。
  const rest = role.startsWith(CERAMIC_ROLE) ? role.slice(CERAMIC_ROLE.length).trim() : role;
  return rest === '' ? value : `${value} (${rest})`;
}
