import { notice } from '../errors.ts';
import type { CursorSpec, FenceError } from '../types.ts';
import { formatBusValue } from './radix.ts';
import type { Row } from './rows.ts';
import { hertzText, secondsText } from './time.ts';
import { inWindow } from './window.ts';
import type { Window } from './window.ts';

/**
 * カーソル (X1・X2) の読み値。**行ごとにその時刻の値** — レーンは 0 / 1、バスは選んだ基数、
 * 読み下しはその時刻を含むフレーム (無ければ `-`)。**変わり目ちょうどの時刻は新しい値**。
 */
export type Cursor = { readonly name: string; readonly time: number };

export type Readings = {
  readonly cursors: readonly Cursor[];
  /** 1 行目は見出し (`信号 / X1 … / X2 …`)。最後に ΔX の行が付く (カーソルが 2 つのとき)。 */
  readonly rows: readonly (readonly string[])[];
};

export const EMPTY_READINGS: Readings = { cursors: [], rows: [] };

const valueText = (row: Row, t: number): string => {
  switch (row.kind) {
    case 'bit': return String(row.levelAt(t));
    case 'bus': return formatBusValue(row.valueAt(t), row.width, row.radix);
    case 'decode': return row.frameAt(t)?.text ?? '-';
  }
};

/** 窓の外のカーソルは言って外す。 */
export function cursorsInside(specs: readonly CursorSpec[], window: Window, said: FenceError[]): readonly Cursor[] {
  const kept: Cursor[] = [];
  specs.forEach((spec, index) => {
    if (inWindow(window, spec.time)) {
      kept.push({ name: `X${index + 1}`, time: spec.time });
    } else {
      said.push(notice(`カーソル X${index + 1} (${secondsText(spec.time)}) は窓 (${secondsText(window.t0)}〜${secondsText(window.t1)}) の外です (描いていません)`, spec.line));
    }
  });
  return kept;
}

export function readCursors(cursors: readonly Cursor[], rows: readonly Row[]): Readings {
  if (cursors.length === 0 || rows.length === 0) return EMPTY_READINGS;
  const head = ['信号', ...cursors.map((cursor) => `${cursor.name} ${secondsText(cursor.time)}`)];
  const body = rows.map((row) => [row.name, ...cursors.map((cursor) => valueText(row, cursor.time))]);
  const [first, second] = cursors;
  const delta = first === undefined || second === undefined ? [] : [deltaRow(second.time - first.time)];
  return { cursors, rows: [head, ...body, ...delta] };
}

function deltaRow(seconds: number): readonly string[] {
  const width = Math.abs(seconds);
  return ['ΔX', secondsText(seconds), width === 0 ? '' : `1/ΔX ${hertzText(1 / width)}`];
}
