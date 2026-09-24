/**
 * 記号の流儀と、circuitikz の鍵への写し。
 *
 * - `american`: 抵抗はギザギザ、コイルは巻線、電圧は + と −、論理ゲートは MIL 記号
 * - `european`: IEC 60617。抵抗は箱、コイルは黒く塗った箱、電圧と電流は矢、
 *   論理ゲートは IEC の箱 (`&` / `≥1`)
 * - `jis`: JIS C 0617 — 電験三種の問題用紙の図がこの形。抵抗は箱、**コイルは半円の
 *   連なり**、電圧と電流は矢、**論理ゲートは MIL 記号のまま** (電験の論理回路の
 *   問題は MIL 記号)。令和 6 年度上期 理論 問 8・10・13 の図で確かめた。
 *   circuitikz の束 (`european`) には委ねず部品ごとの鍵で書く — 束の中身は circuitikz の
 *   版で変わりうる (1.6 では避雷器まで含む) ので、流儀の定義をこちらの手に残す。
 *
 * 表の鍵がそのまま `style: standard:` に書ける語。流儀を足すときはここに 1 行足す
 * (読み取りと TeX の両方がこの表から引くので、片方だけ足す事故が起きない)。
 */
export const STANDARD_TEX = {
  american: 'american',
  european: 'european',
  jis: 'european resistors, cute inductors, european voltages, european currents, american ports',
} as const;

export type Standard = keyof typeof STANDARD_TEX;

/** `style: standard:` に書ける語。断るときの一覧にも使う。 */
export const STANDARDS = Object.keys(STANDARD_TEX) as readonly Standard[];
