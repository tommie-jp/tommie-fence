/**
 * 幅広 DIP (600 mil)。ピンの列の間が 0.6 インチで、普通の 0.3 インチの DIP
 * (e・f 行) と違い、溝をまたぐ 2 列は **6 ピッチ離れた行の組** に挿さる。
 * 書き方は `dipN/wide @ 穴` (姿は `dip8/sop` と同じ位置に書く)。
 *
 * 売られている 600 mil は 24・28・32・40 ピン (SRAM・EEPROM・EPROM・8 ビット CPU)。
 * 16〜20 ピンは 300 mil しか無いので受け取らない。
 */

/** 姿の綴り。 */
export const WIDE_VARIANT = 'wide';

/** 600 mil で売られているピン数。 */
export const WIDE_DIP_SIZES: readonly number[] = [24, 28, 32, 40];

/** ピンの列の間 (ピッチ)。0.6 インチ = 6 ピッチ。 */
export const WIDE_ROW_SPAN = 6;

const DIP_SIZE = /^dip(\d+)$/;

/** その `dipN` に幅広の姿があるか。 */
export function hasWideLook(type: string): boolean {
  const size = DIP_SIZE.exec(type)?.[1];
  return size !== undefined && WIDE_DIP_SIZES.includes(Number(size));
}

/** 幅広の DIP か。 */
export const isWideDip = (variant: string | null): boolean => variant === WIDE_VARIANT;

/** 断り文に入れる、幅広がある大きさ。 */
export const wideSizesText = (): string => `${WIDE_DIP_SIZES.join('・')} ピン`;
