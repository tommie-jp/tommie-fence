import { element, fit, num, svgText } from 'fence-kit';
import { colorValue } from '../color.ts';
import type { Layout } from '../model/layout.ts';
import type { ResolvedNote } from '../types.ts';
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
  const head = 7;
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
      ? element('g', { class: 'cf-chip', 'data-part': noteHandle(note.line) }, drawn)
      : drawn;
  }).join('');
