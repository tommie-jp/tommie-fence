import { fenceError } from '../errors.ts';
import type { FenceError } from '../types.ts';

/**
 * TeX のログを読んで、落ちた行を元の YAML の行へ引き戻す。
 *
 * 検証は全部 YAML 層で終わらせているので、ここへ来るのは検証をすり抜けた
 * ときだけ。それでも「どの行が悪いか分からない」状態にはしないための保険
 * (CLAUDE.md 設計上の約束 5)。
 */

const MAX_MESSAGE = 120;

/** TeX のエラーは `! 説明` で始まり、その後の `l.<行>` が落ちた行を指す。 */
const ERROR_LINE = /^!\s?(.*)$/;
const SOURCE_LINE = /^l\.(\d+)/;

/** 1 回のコンパイルから拾うエラーの数。TeX は 1 つの原因から何件も出す。 */
const MAX_ERRORS = 20;

export function texErrors(
  log: string,
  lineMap: ReadonlyMap<number, number>,
  /** エンジンがフェンスの前に置くプリアンブルの行数。TeX の行番号はこのぶんずれる。 */
  preambleLines: number,
): FenceError[] {
  const rows = log.split('\n');
  const errors: FenceError[] = [];

  for (const [index, row] of rows.entries()) {
    const matched = ERROR_LINE.exec(row);
    if (!matched) continue;
    if (errors.length >= MAX_ERRORS) break;

    const reason = (matched[1] ?? '').slice(0, MAX_MESSAGE);
    errors.push(fenceError(`TeX が止まりました: ${reason}`, yamlLineAfter(rows, index, lineMap, preambleLines)));
  }

  return errors;
}

/**
 * そのエラーが指す YAML の行。次のエラーより手前にある `l.<行>` だけを見る
 * (見つからないときに後続のエラーの行を拾ってしまわないように)。
 */
function yamlLineAfter(
  rows: readonly string[],
  from: number,
  lineMap: ReadonlyMap<number, number>,
  preambleLines: number,
): number | null {
  for (let index = from + 1; index < rows.length; index += 1) {
    const row = rows[index] ?? '';
    if (ERROR_LINE.test(row)) return null;

    const matched = SOURCE_LINE.exec(row);
    if (!matched) continue;

    const texLine = Number(matched[1]) - preambleLines;
    return lineMap.get(texLine) ?? null;
  }

  return null;
}
