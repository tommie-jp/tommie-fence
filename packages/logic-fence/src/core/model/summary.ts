import { LIMITS } from '../limits.ts';
import { formatBusValue } from './radix.ts';
import type { Row } from './rows.ts';
import { axisLabel, axisUnit } from './time.ts';
import type { Window } from './window.ts';

/**
 * 波形の要約 (CLI の `check` が出す)。**図を見なくても本文の表と突き合わせられる**ように、
 * レーンは変わり目の数、バスは値の並びを出す (図のカーソルの表は選んだ時刻の値だけ)。
 */
export function summaryLines(rows: readonly Row[], window: Window): readonly string[] {
  const unit = axisUnit(window.perDiv);
  const at = (t: number): string => axisLabel(t, unit);
  return rows.map((row) => {
    switch (row.kind) {
      case 'bit': {
        const dio = row.dio === null ? '' : ` (DIO${row.dio})`;
        if (row.transitions === null) return `${row.name}${dio}: 密 (変わり目を数えていません)`;
        const rising = row.transitions.filter((edge) => edge.v === 1).length;
        const tail = row.dense ? '・塗りで描画' : '';
        return `${row.name}${dio}: 変わり目 ${row.transitions.length} (立ち上がり ${rising}・立ち下がり ${row.transitions.length - rising})${tail}`;
      }
      case 'bus': {
        if (row.segments === null) return `${row.name}: 密 (塗りで描画)`;
        const shown = row.segments.slice(0, LIMITS.summaryValues).map((segment) => `${formatBusValue(segment.value, row.width, row.radix)}@${at(segment.t0)}`);
        const more = row.segments.length > LIMITS.summaryValues ? ` … (${row.segments.length} 区間)` : '';
        return `${row.name} (${row.radix}): ${shown.join(' ')}${more}`;
      }
      case 'decode': {
        const shown = row.frames.slice(0, LIMITS.summaryValues).map((frame) => `${frame.text}@${at(frame.t0)}`);
        return `${row.name} (${row.protocol}): ${shown.length === 0 ? '(フレーム無し)' : shown.join(' ')}`;
      }
    }
  });
}
