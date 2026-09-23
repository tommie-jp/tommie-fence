import { element, fit, num, svgText, textWidth, TEXT_HALO_WIDTH } from 'fence-kit';
import { colorValue } from '../color.ts';
import { LABEL_GUTTER } from '../model/layout.ts';
import type { Layout } from '../model/layout.ts';
import type { Rect, ResolvedNote } from '../types.ts';
import type { Theme } from './theme.ts';

/**
 * 注釈。**回路の一員ではない** — ネットにもネットリストにも出ない。
 * 図に印を付けて、文章から「そこ」と指せるようにするためだけのもの。
 *
 * **部品と配線より上に描く。** 指したものが下に隠れると、印の意味が無くなる。
 */

/** 丸の半径。穴より一回り大きく、部品の胴より小さい。 */
const MARK_RADIUS = 9;
const STROKE = 2;
/** 字を印からどれだけ上に置くか。 */
const TEXT_RISE = 12;
/** 指し棒の先の印の長さ。 */
const ARROW_HEAD = 7;
/** 板の上の注釈と題の間に残す隙間。 */
const TITLE_CLEARANCE = 4;
/** 字の上端と下端 (ベースラインからの比)。字幅の見積もりと同じ粗さでよい。 */
const ASCENT = 0.72;
const DESCENT = 0.2;

const colorOf = (note: ResolvedNote, theme: Theme): string =>
  (note.color === null ? null : colorValue(note.color)) ?? theme.palette.plateText;

/**
 * 字をどちら向きに伸ばすと一番多く入るか。**盤の端に置いた注釈が 1 字に
 * 切り詰められない**ようにする。中央寄せのまま端に置くと、使える幅は
 * 近いほうの縁までの 2 倍しかなく、1 列目では 3 字も入らない。
 */
function textRoom(x: number, width: number): { anchor: 'start' | 'middle' | 'end'; room: number } {
  const left = x;
  const right = width - x;
  const middle = Math.min(left, right) * 2;
  if (middle >= left && middle >= right) return { anchor: 'middle', room: middle };
  return left > right ? { anchor: 'end', room: left } : { anchor: 'start', room: right };
}

function renderNote(note: ResolvedNote, layout: Layout, theme: Theme): string {
  const from = layout.point(note.from);
  const stroke = colorOf(note, theme);

  if (note.kind === 'mark') {
    return element('circle', {
      cx: num(from.x), cy: num(from.y), r: MARK_RADIUS,
      fill: 'none', stroke, 'stroke-width': STROKE,
    });
  }

  if (note.kind === 'text') {
    // 画布からはみ出した字は**黙って消える**ので、必ず幅で切る。
    // 測る相手は板ではなく画布 — 板の外にも余白があり、そこは使える。
    // **縦に回した字は高さで測る** (横幅で切ると板の広い側で無駄に切れる)。
    const sideways = note.turn.rotate === 90 || note.turn.rotate === 270;
    const { anchor, room } = sideways
      ? { anchor: 'middle' as const, room: layout.height }
      : textRoom(from.x, layout.width);
    const text = fit(note.text ?? '', Math.max(0, room) / theme.metrics.textSize);
    // **反転は字を裏返さない。** 鏡文字は読めないので、指す穴の**反対側**へ移す。
    // 上に何かあって字が重なるときに、下へ逃がすためのもの。
    const rise = note.turn.mirror ? -(TEXT_RISE + theme.metrics.textSize * 0.8) : TEXT_RISE;
    const drawn = svgText(from.x, from.y - rise, text, {
      anchor,
      fill: stroke,
      'font-size': num(theme.metrics.textSize),
      halo: theme.palette.plate,
    });
    // 回すのは**指す穴のまわり**。字の真ん中で回すと、指す先から離れていく。
    return note.turn.rotate === 0
      ? drawn
      : element('g', { transform: `rotate(${num(note.turn.rotate)} ${num(from.x)} ${num(from.y)})` }, drawn);
  }

  const to = note.to === null ? from : layout.point(note.to);

  if (note.kind === 'box') {
    return element('rect', {
      x: num(Math.min(from.x, to.x) - MARK_RADIUS), y: num(Math.min(from.y, to.y) - MARK_RADIUS),
      width: num(Math.abs(to.x - from.x) + MARK_RADIUS * 2),
      height: num(Math.abs(to.y - from.y) + MARK_RADIUS * 2),
      rx: 4, fill: 'none', stroke, 'stroke-width': STROKE,
    });
  }

  // 指し棒。**先端に印を付ける** — ただの線だと、どちらを指しているか読めない。
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const head = ARROW_HEAD;
  const wing = (turn: number) => ({
    x: to.x - head * Math.cos(angle + turn),
    y: to.y - head * Math.sin(angle + turn),
  });
  const left = wing(0.4);
  const right = wing(-0.4);

  return element('line', {
    x1: num(from.x), y1: num(from.y), x2: num(to.x), y2: num(to.y),
    stroke, 'stroke-width': STROKE, 'stroke-linecap': 'round',
  }) + element('polyline', {
    points: `${num(left.x)},${num(left.y)} ${num(to.x)},${num(to.y)} ${num(right.x)},${num(right.y)}`,
    fill: 'none', stroke, 'stroke-width': STROKE, 'stroke-linecap': 'round',
  });
}

/**
 * 掴み手の名札。**注釈には名前が無いので行番号で指す** (配線と同じ考え方)。
 * 部品と同じ `data-part` に載せるので、殻は注釈を部品として扱える —
 * 選ぶ・動かす・複製する・消すが**そのまま通る**。
 */
export const noteHandle = (line: number): string => `note:${line}`;

export const renderNotes = (
  notes: readonly ResolvedNote[],
  layout: Layout,
  theme: Theme,
  edit = false,
): string =>
  notes.map((note) => {
    const drawn = renderNote(note, layout, theme);
    return edit && note.line !== null
      ? element('g', { class: 'cf-chip', 'data-part': noteHandle(note.line), 'data-note': '1' }, drawn)
      : drawn;
  }).join('');

/**
 * 板に書いた字が占める帯。**書いた人が番地で決めた場所**なので、自動で置く
 * 名札のほうが避ける (`captions.ts`)。回した字は帯で囲めないので数えない。
 */
export function noteBands(
  notes: readonly ResolvedNote[],
  layout: Layout,
  theme: Theme,
): Rect[] {
  const size = theme.metrics.textSize;
  return notes.flatMap((note) => {
    if (note.kind !== 'text' || note.turn.rotate !== 0) return [];
    const from = layout.point(note.from);
    const { anchor, room } = textRoom(from.x, layout.width);
    const text = fit(note.text ?? '', Math.max(0, room) / size);
    const width = textWidth(text) * size;
    const rise = note.turn.mirror ? -(TEXT_RISE + size * 0.8) : TEXT_RISE;
    const baseline = from.y - rise;
    const x = anchor === 'start' ? from.x : anchor === 'end' ? from.x - width : from.x - width / 2;
    return [{ x, y: baseline - size * 0.72, width, height: size * 0.92 }];
  });
}

/** 注釈 1 つが縦に占める幅 (上端と下端)。書き出しと部品表は板の外の帯なので数えない。 */
function noteSpan(note: ResolvedNote, layout: Layout, theme: Theme): { top: number; bottom: number } {
  const from = layout.point(note.from);
  const to = note.to === null ? from : layout.point(note.to);
  const high = Math.min(from.y, to.y);
  const low = Math.max(from.y, to.y);

  if (note.kind === 'mark' || note.kind === 'box') {
    const reach = MARK_RADIUS + STROKE / 2;
    return { top: high - reach, bottom: low + reach };
  }
  if (note.kind !== 'text') return { top: high - ARROW_HEAD, bottom: low + ARROW_HEAD };

  const size = theme.metrics.textSize;
  const halo = TEXT_HALO_WIDTH / 2;
  // **縦に回した字は長さがそのまま縦に伸びる** (回すのは指す穴のまわり)。
  if (note.turn.rotate === 90 || note.turn.rotate === 270) {
    const text = fit(note.text ?? '', Math.max(0, layout.height) / size);
    const half = (textWidth(text) * size) / 2 + halo;
    return { top: from.y - half, bottom: from.y + half };
  }
  const rise = note.turn.mirror ? -(TEXT_RISE + size * 0.8) : TEXT_RISE;
  const baseline = from.y - rise;
  const top = baseline - size * ASCENT - halo;
  const bottom = baseline + size * DESCENT + halo;
  // 逆さの字は指す穴を挟んで反対側に来る。
  return note.turn.rotate === 180
    ? { top: 2 * from.y - bottom, bottom: 2 * from.y - top }
    : { top, bottom };
}

/**
 * 板の外に書いた注釈のために、板の上と下へ空ける量。
 *
 * **書いた人が番地で決めた場所なので、図のほうが場所を空ける。** 空けないと、
 * 上は題に重なり、離れた番地の字は画布の外で黙って切れる。
 * 板の上の名前の帯 (`LABEL_GUTTER`) はいつも空いているので、そこに収まる注釈は
 * 何も動かさない — 板に書いた注釈のために図の寸法を変えない。
 */
export function noteOverhang(
  notes: readonly ResolvedNote[],
  layout: Layout,
  theme: Theme,
  labelsBelow: boolean,
): { readonly above: number; readonly below: number } {
  const { y, height } = layout.board;
  const spans = notes.map((note) => noteSpan(note, layout, theme));
  const top = Math.min(y, ...spans.map((span) => span.top));
  const bottom = Math.max(y + height, ...spans.map((span) => span.bottom));
  return {
    above: Math.max(0, y - top - (LABEL_GUTTER - TITLE_CLEARANCE)),
    below: Math.max(0, bottom - (y + height) - (labelsBelow ? LABEL_GUTTER : 0)),
  };
}
