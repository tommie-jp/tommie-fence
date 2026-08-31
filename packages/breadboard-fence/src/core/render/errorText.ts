import type { FenceError } from '../types.ts';

/**
 * 報告の文面。**プレビューの帯でも CLI の標準エラーでも同じ形**にする。
 * 頭に必ず名札を付けるのは、他人のノートに埋め込まれた図が出す言葉だから
 * (どの道具が言っているのか分からないと、直す場所を探せない)。
 */
export const LABEL = 'breadboard';

export const errorLine = (error: FenceError): string => {
  const where = error.line === null ? '' : `${error.line} 行目: `;
  return `${LABEL}: ${where}${error.message}`;
};

/**
 * 行の中身と、読めなかった綴りの下に付ける印。
 *
 * ```text
 *   breadboard: 4 行目: 知らない部品の種類です: resistr (resistor のことですか?)
 *       R1: resistr a5 a10 10k
 *           ^^^^^^^
 * ```
 */
export function sourceRows(error: FenceError): string[] {
  if (error.text === undefined) return [];
  if (error.at === undefined) return [error.text];

  const { column, length } = error.at;
  // 印は本文と同じ桁に置く。全角は 1 文字 2 桁ぶんの幅を持つので、
  // 等幅で出す前提の空白詰めでは合わせきれない。ここは桁数だけを合わせる。
  return [error.text, `${' '.repeat(column)}${'^'.repeat(Math.max(1, length))}`];
}

/** 1 件ぶんの、そのまま端末に出せる文面。 */
export const errorText = (error: FenceError): string =>
  [errorLine(error), ...sourceRows(error).map((row) => `    ${row}`)].join('\n');
