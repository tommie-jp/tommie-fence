import { colName, rowName } from '../model/address.ts';
import type { LabelCase, Spelling } from '../types.ts';

/**
 * 基板の外に出す行・列の名前。**番地の綴りと同じ字** — 図の端の `C` と `05` の穴は
 * フェンスにも `c5` と書く (基板・図・綴りの 3 つが同じ名前)。英字と数字のどちらが
 * 行かは基板のシルク (`board: silk:`) が決める。
 *
 * 英字は既定で**大文字** (秋月の基板のシルクが A・E・J・O と大文字なので、そちらに合わせる)。
 */
const caseOf = (name: string, letters: LabelCase): string =>
  letters === 'upper' ? name.toUpperCase() : name;

export const rowAxisLabel = (row: number, spelling: Spelling, letters: LabelCase): string =>
  caseOf(rowName(row, spelling), letters);

export const colAxisLabel = (col: number, spelling: Spelling, letters: LabelCase): string =>
  caseOf(colName(col, spelling), letters);
