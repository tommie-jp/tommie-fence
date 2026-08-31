import type { Layout } from '../model/layout.ts';
import { DEFAULT_MARK_COLOR, noteColorValue, noteLeading, noteSizeScale } from '../notes.ts';
import type { NoteAlign } from '../notes.ts';
import type { NoteSpec, Point } from '../types.ts';
import { haloWidth } from './partCommon.ts';
import { element, num, svgText } from './svg.ts';
import { fit } from './textFit.ts';
import type { RenderTheme } from './theme.ts';

/**
 * 注釈の指し先。**部品を指したときは部品を囲む楕円**、穴を指したときは
 * 穴 1 つを囲む小さい丸になる。囲む形が 1 つあれば、印 (`circle`) も
 * 指し棒の止まる位置も同じ計算で決まる。
 */
export type NoteAnchor = {
  readonly center: Point;
  readonly rx: number;
  readonly ry: number;
  /**
   * 指し先が部品かどうか。**指し棒と直線は、部品のときだけ囲みの縁で止める**。
   * 穴を指したときは穴そのものが目的地なので、手前で止めると
   * どの穴を指しているのか分からなくなる (レールどうしを結ぶ直線は消える)。
   */
  readonly part: boolean;
};

export type ResolvedNote = { readonly spec: NoteSpec; readonly anchors: readonly NoteAnchor[] };

/** 印の線の太さと、囲みの余白。 */
const MARK_WIDTH = 2;
const BOX_PAD = 8;
const ARROW_HEAD = 9;
const ARROW_HALF = 4;
const DASH = '6 4';

/** 等幅で書く `- source` の字。図の他の字とは別の family を使う。 */
const MONO_FAMILY = "ui-monospace, 'DejaVu Sans Mono', 'Noto Sans Mono CJK JP', monospace";

const inkOf = (theme: RenderTheme): string => theme.palette.partText;

const colorOf = (note: NoteSpec, theme: RenderTheme): string =>
  noteColorValue(note.color ?? DEFAULT_MARK_COLOR, inkOf(theme));

const textColorOf = (note: NoteSpec, theme: RenderTheme): string =>
  note.color === null ? inkOf(theme) : noteColorValue(note.color, inkOf(theme));

const fontSizeOf = (note: NoteSpec, theme: RenderTheme): number =>
  theme.metrics.textSize * noteSizeScale(note.size ?? 'normal');

const ANCHORS: Record<NoteAlign, 'start' | 'middle' | 'end'> = {
  left: 'start', center: 'middle', right: 'end',
};

/**
 * 注釈を図の上に重ねる。**板・部品・配線を描き終えたあと**に呼ぶ。
 * 注釈は回路の一員ではないので、ネットにも部品リストにも入らない。
 */
export function renderNotes(
  notes: readonly ResolvedNote[],
  layout: Layout,
  theme: RenderTheme,
  sourceLines: readonly string[],
): string {
  return notes.map((note) => renderNote(note, layout, theme, sourceLines)).join('');
}

/**
 * 注釈が図の下へどこまで伸びるか。**字は板の外へはみ出しても切らずに、
 * 画布のほうを伸ばす** (`- source` はフェンス全体を書き出すので、
 * 板の高さに収まらないのが普通)。横は板の幅で `…` に切る。
 */
export function notesBottom(
  notes: readonly ResolvedNote[],
  theme: RenderTheme,
  sourceLines: readonly string[],
): number {
  let bottom = 0;
  for (const note of notes) {
    const { spec } = note;
    if (spec.kind !== 'text' && spec.kind !== 'source') continue;
    const anchor = note.anchors[0];
    if (!anchor) continue;

    const size = fontSizeOf(spec, theme);
    const lines = linesOf(spec, sourceLines).length;
    const step = size * noteLeading(spec.leading, spec.kind);
    bottom = Math.max(bottom, anchor.center.y + step * (lines - 1) + size * 0.4);
  }
  return bottom;
}

function linesOf(spec: NoteSpec, sourceLines: readonly string[]): readonly string[] {
  if (spec.kind === 'source') return sourceLines;
  return (spec.text ?? '').split('\n');
}

function renderNote(
  note: ResolvedNote,
  layout: Layout,
  theme: RenderTheme,
  sourceLines: readonly string[],
): string {
  const { spec, anchors } = note;
  const [first, second] = anchors;
  if (!first) return '';

  if (spec.kind === 'circle') return renderCircle(first, colorOf(spec, theme));
  if (spec.kind === 'box') return second ? renderBox(first, second, spec.solid, colorOf(spec, theme)) : '';
  if (spec.kind === 'arrow' || spec.kind === 'line') {
    return second ? renderLink(first, second, spec.kind === 'arrow', colorOf(spec, theme)) : '';
  }
  return renderText(spec, first, layout, theme, linesOf(spec, sourceLines));
}

const renderCircle = (anchor: NoteAnchor, color: string): string =>
  element('ellipse', {
    cx: num(anchor.center.x), cy: num(anchor.center.y), rx: num(anchor.rx), ry: num(anchor.ry),
    fill: 'none', stroke: color, 'stroke-width': MARK_WIDTH,
  });

function renderBox(from: NoteAnchor, to: NoteAnchor, solid: boolean, color: string): string {
  const left = Math.min(from.center.x - from.rx, to.center.x - to.rx) - BOX_PAD;
  const right = Math.max(from.center.x + from.rx, to.center.x + to.rx) + BOX_PAD;
  const top = Math.min(from.center.y - from.ry, to.center.y - to.ry) - BOX_PAD;
  const bottom = Math.max(from.center.y + from.ry, to.center.y + to.ry) + BOX_PAD;

  return element('rect', {
    x: num(left), y: num(top), width: num(right - left), height: num(bottom - top), rx: 4,
    fill: 'none', stroke: color, 'stroke-width': MARK_WIDTH,
    ...(solid ? {} : { 'stroke-dasharray': DASH }),
  });
}

/** 縁で止めたあとに残す線の長さ。矢じりが収まるだけは要る。 */
const MIN_LINK = ARROW_HEAD + 3;

/**
 * 指し棒と直線。**両端は指し先を囲む楕円の縁で止める**ので、
 * 部品を指しても字や本体に重ならない。
 *
 * 両端を別々に引っ込めると、**囲みが重なったときに始点が終点を追い越す**。
 * 隣の行の部品どうし (中心間 20px、半径は上下 11px ずつ) は必ずそうなり、
 * 線が裏返って矢じりが逆を向く。引っ込める量の合計を線の長さで頭打ちにして、
 * 足りないときは両端から同じ割合で削る。
 */
function renderLink(from: NoteAnchor, to: NoteAnchor, head: boolean, color: string): string {
  const dx = to.center.x - from.center.x;
  const dy = to.center.y - from.center.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return '';

  const ux = dx / length;
  const uy = dy / length;
  const room = Math.max(0, length - MIN_LINK);
  let head1 = reachOf(from, ux, uy);
  let head2 = reachOf(to, -ux, -uy);
  if (head1 + head2 > room) {
    const shrink = room / (head1 + head2);
    head1 *= shrink;
    head2 *= shrink;
  }

  const start = { x: from.center.x + ux * head1, y: from.center.y + uy * head1 };
  const end = { x: to.center.x - ux * head2, y: to.center.y - uy * head2 };
  const line = element('line', {
    x1: num(start.x), y1: num(start.y), x2: num(end.x), y2: num(end.y),
    stroke: color, 'stroke-width': MARK_WIDTH, 'stroke-linecap': 'round',
  });
  return head ? line + arrowHead(start, end, color) : line;
}

/** 中心から `(ux, uy)` の向きへ、楕円の縁までの距離。穴を指したときは 0。 */
function reachOf(anchor: NoteAnchor, ux: number, uy: number): number {
  if (!anchor.part || anchor.rx === 0 || anchor.ry === 0) return 0;
  return 1 / Math.hypot(ux / anchor.rx, uy / anchor.ry);
}

function arrowHead(from: Point, to: Point, color: string): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return '';

  const ux = dx / length;
  const uy = dy / length;
  const baseX = to.x - ux * ARROW_HEAD;
  const baseY = to.y - uy * ARROW_HEAD;
  const points = [
    `${num(to.x)},${num(to.y)}`,
    `${num(baseX - uy * ARROW_HALF)},${num(baseY + ux * ARROW_HALF)}`,
    `${num(baseX + uy * ARROW_HALF)},${num(baseY - ux * ARROW_HALF)}`,
  ].join(' ');
  return element('polygon', { points, fill: color });
}

/**
 * 図に重ねる字。**板からはみ出す幅は `…` で切る** (図のキャプションと同じ約束)。
 * 縦は切らず、画布のほうを伸ばす (`notesBottom`)。
 */
function renderText(
  spec: NoteSpec,
  anchor: NoteAnchor,
  layout: Layout,
  theme: RenderTheme,
  lines: readonly string[],
): string {
  const size = fontSizeOf(spec, theme);
  const align: NoteAlign = spec.align ?? 'left';
  const step = size * noteLeading(spec.leading, spec.kind);
  const mono = spec.kind === 'source';
  // `fit` の目安は「字の大きさを 1 とした幅」。等幅の英数字は比例フォントの
  // 見積もり (0.55) より広いので、そのぶん早めに切る。
  const room = roomFor(anchor.center.x, align, layout) / (size * (mono ? 1.1 : 1));

  return lines
    .map((text, index) =>
      svgText(anchor.center.x, anchor.center.y + step * index, fit(text, room), {
        'font-size': num(size),
        ...(spec.bold ? { 'font-weight': 700 } : {}),
        ...(mono ? { 'font-family': MONO_FAMILY, 'xml:space': 'preserve' } : {}),
        fill: textColorOf(spec, theme),
        anchor: ANCHORS[align],
        halo: theme.palette.textHalo,
        haloWidth: haloWidth(theme),
      }),
    )
    .join('');
}

/** その置き方で板の中に残っている幅。 */
function roomFor(x: number, align: NoteAlign, layout: Layout): number {
  const left = x - layout.board.x;
  const right = layout.board.x + layout.board.width - x;
  if (align === 'left') return Math.max(0, right);
  if (align === 'right') return Math.max(0, left);
  return Math.max(0, Math.min(left, right)) * 2;
}
