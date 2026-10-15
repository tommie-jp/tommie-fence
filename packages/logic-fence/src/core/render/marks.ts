import { element, num, svgText } from 'fence-kit';
import type { Layout } from '../layout/screen.ts';
import type { Cursor } from '../model/cursors.ts';
import type { TriggerMark } from '../model/trigger.ts';
import { xOf } from '../model/window.ts';
import type { Window } from '../model/window.ts';
import type { Theme } from './theme.ts';

/** カーソルとトリガの印。**縦の線は格子の全部の行を貫く** (どの行の値かをカーソルの位置で読む)。 */
const TRIANGLE = 5;

export function renderTrigger(mark: TriggerMark | null, window: Window, layout: Layout, theme: Theme): string {
  if (mark === null || layout.triggerTop === null) return '';
  const x = layout.plot.x + xOf(window, mark.time);
  const top = layout.triggerTop + 1;
  const color = theme.palette.trigger;
  const size = theme.metrics.smallSize;
  return element('line', {
    x1: num(x), y1: num(top + TRIANGLE * 1.6), x2: num(x), y2: num(layout.plot.y + layout.plot.height), stroke: color, 'stroke-width': 1, 'stroke-dasharray': '4 3',
  })
    + element('path', { d: `M${num(x - TRIANGLE)} ${num(top)}H${num(x + TRIANGLE)}L${num(x)} ${num(top + TRIANGLE * 1.6)}Z`, fill: color })
    + svgText(x + TRIANGLE + 3, top + size * 0.75, 'T', { anchor: 'start', fill: color, 'font-size': num(size), 'font-weight': 600 });
}

/** カーソルの線の種類。X1 は実線、X2 以降は破線の組を順に使う (色だけに頼らない)。 */
const DASHES: readonly (string | null)[] = [null, '5 3', '2 3', '8 3 2 3'];

export function renderCursors(cursors: readonly Cursor[], window: Window, layout: Layout, theme: Theme): string {
  if (layout.cursorBaseline === null) return '';
  const size = theme.metrics.smallSize;
  // 名札は、書いた順に時刻が増えていくなら線の左へ、そうでなければ右へ出す
  // (2 本が近いとき重ならない。1 本だけなら右)。3 本以上でも同じ向きにそろえる。
  const ascending = cursors.every((cursor, index) => index === 0 || cursor.time >= (cursors[index - 1]?.time ?? 0));
  const anchor = cursors.length >= 2 && ascending ? 'end' : 'start';
  return cursors.map((cursor, index) => {
    const x = layout.plot.x + xOf(window, cursor.time);
    const color = theme.palette.cursors[index % theme.palette.cursors.length] ?? theme.palette.caption;
    const dash = DASHES[index % DASHES.length] ?? null;
    return element('line', {
      x1: num(x), y1: num(layout.cursorBaseline! + 3), x2: num(x), y2: num(layout.plot.y + layout.plot.height), stroke: color, 'stroke-width': 1.4,
      ...(dash === null ? {} : { 'stroke-dasharray': dash }),
    }) + svgText(x + (anchor === 'end' ? -3 : 3), layout.cursorBaseline!, cursor.name, {
      anchor, fill: color, 'font-size': num(size), 'font-weight': 600,
    });
  }).join('');
}
