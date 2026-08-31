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
  return onBoard(notes).map((note) => renderNote(note, layout, theme, sourceLines)).join('');
}

/** 板の上に重ねる注釈と、図の外に置く注釈。場所の語を書いたものが後者。 */
export const onBoard = (notes: readonly ResolvedNote[]): readonly ResolvedNote[] =>
  notes.filter((note) => note.spec.place === null);

export const placedOutside = (notes: readonly ResolvedNote[]): readonly ResolvedNote[] =>
  notes.filter((note) => note.spec.place !== null);

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
  for (const note of onBoard(notes)) {
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

/** 図の外の帯の、上下と、注釈どうしの間に入れる余白。 */
const BAND_PAD = 10;
const BAND_GAP = 8;

/**
 * 板の外に置いた字が使う高さ。板の上に重ねるものと違って**画布を伸ばすのではなく、
 * 自分の帯を持つ** (部品リストと同じ立て付け)。
 */
export function outsideNotesHeight(
  notes: readonly ResolvedNote[],
  theme: RenderTheme,
  sourceLines: readonly string[],
): number {
  const placed = placedOutside(notes);
  if (placed.length === 0) return 0;

  const blocks = placed.map((note) => blockHeight(note.spec, theme, sourceLines));
  return BAND_PAD * 2 + blocks.reduce((sum, height) => sum + height, 0) + BAND_GAP * (blocks.length - 1);
}

const blockHeight = (spec: NoteSpec, theme: RenderTheme, sourceLines: readonly string[]): number => {
  const size = fontSizeOf(spec, theme);
  const step = size * noteLeading(spec.leading, spec.kind);
  return step * (linesOf(spec, sourceLines).length - 1) + size;
};

/**
 * 板の外に置いた字。板の下、部品リストの後ろに、書いた順に積む。
 *
 * 板の番地はどれも実在の穴に縛られているので、**板の外を指す番地が存在しない**。
 * 図の説明や書き写し用の写しを板の上に重ねると穴と印字に重なるので、
 * 場所の語を書いたものはここへ流す。
 */
export function renderOutsideNotes(
  notes: readonly ResolvedNote[],
  x: number,
  top: number,
  width: number,
  theme: RenderTheme,
  sourceLines: readonly string[],
): string {
  const placed = placedOutside(notes);
  if (placed.length === 0) return '';

  let y = top + BAND_PAD;
  const drawn: string[] = [];
  for (const note of placed) {
    const { spec } = note;
    const size = fontSizeOf(spec, theme);
    const align: NoteAlign = spec.align ?? 'left';
    const step = size * noteLeading(spec.leading, spec.kind);
    // 帯の中では、寄せに応じて基準の x が端から端へ動く。
    const at = align === 'left' ? x : align === 'right' ? x + width : x + width / 2;

    drawn.push(textLines(spec, linesOf(spec, sourceLines), at, y + size * 0.8, step, width, theme));
    y += blockHeight(spec, theme, sourceLines) + BAND_GAP;
  }
  return drawn.join('');
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
  const room = roomFor(anchor.center.x, align, layout);

  return textLines(spec, lines, anchor.center.x, anchor.center.y, step, room, theme, true);
}

/**
 * 字を 1 行ずつ置く。板の上でも図の外でも同じ描き方で、違うのは
 * 基準の座標と、`…` に切るときの残り幅だけ。
 */
function textLines(
  spec: NoteSpec,
  lines: readonly string[],
  x: number,
  baseline: number,
  step: number,
  room: number,
  theme: RenderTheme,
  halo = false,
): string {
  const size = fontSizeOf(spec, theme);
  const align: NoteAlign = spec.align ?? 'left';
  const mono = spec.kind === 'source';
  // `fit` の目安は「字の大きさを 1 とした幅」。等幅の英数字は比例フォントの
  // 見積もり (0.55) より広いので、そのぶん早めに切る。
  const limit = room / (size * (mono ? 1.1 : 1));

  return lines
    .map((text, index) =>
      svgText(x, baseline + step * index, fit(text, limit), {
        'font-size': num(size),
        ...(spec.bold ? { 'font-weight': 700 } : {}),
        ...(mono ? { 'font-family': MONO_FAMILY, 'xml:space': 'preserve' } : {}),
        fill: textColorOf(spec, theme),
        anchor: ANCHORS[align],
        // 帯の中は下地が無地なので縁取りは要らない。板に重ねるときだけ敷く。
        ...(halo ? { halo: theme.palette.textHalo, haloWidth: haloWidth(theme) } : {}),
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
