import { rowLabel } from '../model/address.ts';
import type { LabelCase, LabelKind } from '../types.ts';

/**
 * 板の外に出す行・列の名前。**印字だけの話で、番地は変わらない** —
 * `b3` はどう印字しても b 行 3 列のまま。手元の実物のシルクに寄せて、
 * 図と板を見比べやすくするためのもの。
 *
 * 既定は**行が英字・列が数字**で、英字は**大文字** (秋月の板のシルクが
 * A・E・J・O と大文字なので、そちらに合わせる)。
 */
export function axisLabel(index: number, kind: LabelKind, letters: LabelCase): string {
  if (kind === 'numeric') return String(index);
  const label = rowLabel(index);
  return letters === 'upper' ? label.toUpperCase() : label;
}
