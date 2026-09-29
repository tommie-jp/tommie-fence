/**
 * バスの値の書き方 (WaveForms の Logic のバスの Format)。
 * **書くときの綴りがそのまま図と読み値の字になる** (`hex` → `0x3`)。
 */
export const RADIXES = ['hex', 'bin', 'dec', 'sint'] as const;

export type Radix = (typeof RADIXES)[number];

export const isRadix = (word: string): word is Radix => (RADIXES as readonly string[]).includes(word);

/**
 * 値 (0 以上の整数、`width` ビット) を字にする。
 * - `hex`: `0x` + 大文字、桁は width に合わせて 0 で埋める (`0x0A`)
 * - `bin`: `0b` + width 桁 (`0b0101`)
 * - `dec`: 符号なしの 10 進
 * - `sint`: 2 の補数の符号つき 10 進 (`0b1110` は 4 ビットで `-2`)
 */
export function formatBusValue(value: number, width: number, radix: Radix): string {
  switch (radix) {
    case 'hex':
      return `0x${value.toString(16).toUpperCase().padStart(Math.ceil(width / 4), '0')}`;
    case 'bin':
      return `0b${value.toString(2).padStart(width, '0')}`;
    case 'dec':
      return String(value);
    case 'sint':
      return String(value >= 2 ** (width - 1) ? value - 2 ** width : value);
  }
}
