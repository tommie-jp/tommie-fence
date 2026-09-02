import { DEFAULT_WIRE_COLOR, wireColor, wireColorNames } from 'fence-kit';

/**
 * 図に出す色。**名前か、`#RRGGBB` の綴りだけ**を通す。
 *
 * 色は入力からそのまま SVG の属性へ流れるので、ここが唯一の関所になる。
 * 何でも通すと `red" onload="…` のような綴りが属性を割って出るため、
 * **持っている名前か、字面が厳密に色である綴りか**の 2 通りに限る。
 *
 * 実物の配線の色は名前 (`red` `black`) が正で、そちらのほうが読んで分かる。
 * `#RRGGBB` は**手元の被覆の色に寄せたいとき**のためのもの。
 */

/** `#f00` と `#ff0000`。大小は問わない (書く人が揃えなくて済むように)。 */
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/;

export const isColorName = (text: string): boolean => wireColorNames().includes(text.toLowerCase());

export const isColor = (text: string): boolean => {
  const written = text.toLowerCase();
  return isColorName(written) || HEX.test(written);
};

/** 書かれた色を実際の色に直す。読めない綴りは null (呼ぶ側が既定色を選ぶ)。 */
export const colorValue = (text: string): string | null => {
  const written = text.toLowerCase();
  return HEX.test(written) ? written : wireColor(written);
};

/** 配線の色。書かれていない・読めないときは既定の灰色。 */
export const wireStroke = (color: string | null): string =>
  (color === null ? null : colorValue(color)) ?? DEFAULT_WIRE_COLOR;

/** 報告に添える例。**全部は並べない** — 帯が読めなくなる。 */
export const colorHint = (): string => `${wireColorNames().slice(0, 6).join(' / ')} など、または #ff0000`;
