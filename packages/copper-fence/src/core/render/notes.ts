import { element, num, svgText, textWidth } from 'fence-kit';
import type { Layout } from '../model/layout.ts';
import { formatMm } from '../model/point.ts';
import type { Mm, NoteSpec } from '../types.ts';
import type { Theme } from './theme.ts';

/**
 * 注釈。**回路の一員ではない** (ネットにもネットリストにも出ない)。
 * `dim` は寸法線で、2 点の間の長さを測って出す — 手で切る板の寸法図のため。
 */

const ARROW = 5;

export const noteColor = (note: NoteSpec, theme: Theme, colorOf: (name: string) => string | null): string =>
  (note.color === null ? null : colorOf(note.color)) ?? theme.palette.caption;

function arrowHead(from: { x: number; y: number }, to: { x: number; y: number }, color: string): string {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const wing = (turn: number): string =>
    `${num(to.x - ARROW * Math.cos(angle + turn))},${num(to.y - ARROW * Math.sin(angle + turn))}`;
  return element('polygon', { points: `${num(to.x)},${num(to.y)} ${wing(0.45)} ${wing(-0.45)}`, fill: color });
}

/** 寸法線。両端に矢、真ん中に長さ。**字は線の外側**に置く (線と重ねない)。 */
function dimension(from: Mm, to: Mm, layout: Layout, theme: Theme, color: string): string {
  const [a, b] = [layout.toPx(from), layout.toPx(to)];
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  const size = theme.metrics.lineTextSize;
  const line = element('line', { x1: num(a.x), y1: num(a.y), x2: num(b.x), y2: num(b.y), stroke: color, 'stroke-width': 0.8 });
  const [ux, uy] = [(b.x - a.x) / Math.hypot(b.x - a.x, b.y - a.y), (b.y - a.y) / Math.hypot(b.x - a.x, b.y - a.y)];
  const tick = (at: { x: number; y: number }): string => element('line', {
    x1: num(at.x - uy * 4), y1: num(at.y + ux * 4), x2: num(at.x + uy * 4), y2: num(at.y - ux * 4),
    stroke: color, 'stroke-width': 0.8,
  });
  const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const label = svgText(middle.x - uy * (size * 0.9), middle.y + ux * (size * 0.9) * -1 + size * 0.35, `${formatMm(length)}mm`, {
    anchor: 'middle', fill: color, 'font-size': num(size), halo: theme.palette.halo, haloWidth: 2.4,
  });
  return line + arrowHead(b, a, color) + arrowHead(a, b, color) + tick(a) + tick(b) + label;
}

export function renderNotes(
  notes: readonly NoteSpec[],
  layout: Layout,
  theme: Theme,
  colorOf: (name: string) => string | null,
): string {
  const size = theme.metrics.textSize;
  return notes.map((note) => {
    const color = noteColor(note, theme, colorOf);
    const from = note.from === null ? null : layout.toPx(note.from);
    const to = note.to === null ? null : layout.toPx(note.to);
    switch (note.kind) {
      case 'mark':
        return from === null ? '' : element('circle', {
          cx: num(from.x), cy: num(from.y), r: num(layout.len(1.5)), fill: 'none', stroke: color, 'stroke-width': 1.5,
        });
      case 'box': {
        if (from === null || to === null) return '';
        const [x, y] = [Math.min(from.x, to.x), Math.min(from.y, to.y)];
        return element('rect', {
          x: num(x), y: num(y), width: num(Math.abs(to.x - from.x)), height: num(Math.abs(to.y - from.y)),
          fill: 'none', stroke: color, 'stroke-width': 1.5, 'stroke-dasharray': '4 2',
        });
      }
      case 'arrow':
        return from === null || to === null ? '' : element('line', {
          x1: num(from.x), y1: num(from.y), x2: num(to.x), y2: num(to.y), stroke: color, 'stroke-width': 1.4,
        }) + arrowHead(from, to, color);
      case 'dim':
        return note.from === null || note.to === null ? '' : dimension(note.from, note.to, layout, theme, color);
      case 'text': {
        if (from === null || note.text === null) return '';
        const body = svgText(0, size * 0.35, note.text, {
          anchor: 'start', fill: color, 'font-size': num(size), halo: theme.palette.halo, haloWidth: 2.4,
        });
        // **回るのは指す点のまわり** (perfboard と同じ)。
        return element('g', { transform: `translate(${num(from.x + 2)} ${num(from.y)}) rotate(${note.turn})` }, body);
      }
      default:
        return '';
    }
  }).join('');
}

/** 注釈が板の外へ出す広がり (mm)。**字の幅も見込む** — 見込まないと画布の外で切れる。 */
export function noteBounds(notes: readonly NoteSpec[], theme: Theme, pxPerMm: number): Mm[] {
  const size = theme.metrics.textSize;
  return notes.flatMap((note) => {
    const points = [note.from, note.to].filter((point): point is Mm => point !== null);
    if (note.kind !== 'text' || note.from === null || note.text === null) return points;
    const wide = (textWidth(note.text) * size + 4) / pxPerMm;
    const tall = size / pxPerMm;
    const sideways = note.turn === 90 || note.turn === 270;
    return [
      note.from,
      sideways
        ? { x: note.from.x + tall, y: note.from.y + (note.turn === 90 ? wide : -wide) }
        : { x: note.from.x + (note.turn === 180 ? -wide : wide), y: note.from.y + tall },
    ];
  });
}
