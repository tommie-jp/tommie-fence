import { PARTS_HEADINGS, bandColor, partKind, partsMark, valueWithRole } from 'fence-kit';
import type { PartsMark } from 'fence-kit';
import { LIMITS } from '../limits.ts';
import { fit, textWidth } from './textFit.ts';
import type { Board, BoardSize, PlacedPart } from '../types.ts';
import { BOARD_HALO_OPACITY, TEXT_HALO_WIDTH, element, num, svgText } from './svg.ts';
import type { RenderTheme } from './theme.ts';
import { isLight, textScale } from './theme.ts';

/** 部品リストと、その下に続く帯との間に空ける高さ。 */
const GAP = 12;
/** 行の高さと板の内側の余白。字の大きさに対する比で持つ (テーマごとに字が違うため)。 */
const LINE_RATIO = 1.5;
const PAD_RATIO = 0.9;
/** 字の上端からベースラインまで。板の中で行を上下に振り分けるのに使う。 */
const CAP_RATIO = 0.8;
/** 列と列の間。字の大きさの何倍か。 */
const COLUMN_GAP = 1.5;

/** 板にこれだけの幅も残っていない列は、出さずに諦める (字の大きさに対する比)。 */
const MIN_COLUMN_WIDTH = 4;

/**
 * 種類の列に許す幅。実在の種類は `capacitor/electrolytic` が最長 (12.1) なので普段は効かない。
 * `dip0008` のようにゼロを詰めた種類が通ってしまう (`placement/footprints.ts` の
 * DIP_PATTERN) ため、長すぎる種類が値の列を押し出さないようにする。
 */
const MAX_TYPE_WIDTH = 13;

/** 帯の色の四角。1 本ぶんの幅と間 (字の大きさに対する比)。高さは字の高さに合わせる (perfboard と同じ)。 */
const SWATCH = { width: 0.9, gap: 0.25, height: 0.8 } as const;

/**
 * 表の 1 行。最後の欄は抵抗なら帯の色の並び (四角で描く)、コンデンサなら胴の記号 (`104`)。
 * 欄の中身は perfboard の部品表と同じもの (fence-kit)。
 */
type Row = { readonly id: string; readonly type: string; readonly value: string; readonly mark: PartsMark };

/** 見出しの行。番号と型番だけが並ぶと、どの欄が値なのかが読めない。 */
const HEADING_ROW: Row = {
  id: PARTS_HEADINGS[0], type: PARTS_HEADINGS[1], value: PARTS_HEADINGS[2], mark: PARTS_HEADINGS[3],
};

/**
 * 値は**図に出ているのと同じ文字列**だけを選ぶ。整えたり (`10k` → `10kΩ`) はしない。
 * 図の字と食い違うと突き合わせに使えなくなる。
 *
 * 機器はラベルしか見ない (`render/devices.ts` の captionOf が `label ?? id` で、
 * 値は図に出ない)。ラベルが無ければ箱には ID が出ており、それは ID の列にもう
 * 並んでいるので、値の列は空にする。
 */
const valueOf = (part: PlacedPart): string =>
  (part.kind === 'device' ? part.label : part.value ?? part.label) ?? '';

/**
 * 種類の列には姿も添える (`capacitor/ceramic`)。同じ `0.1u` でもセラミックか
 * フィルムかは買うときに効く違いで、図だけを渡された人はここでしか読めない。
 */
const typeOf = (part: PlacedPart): string =>
  part.kind === 'device' ? part.type : partKind(part.type, part.variant, valueOf(part));

/** 実物の穴数。`board:` のサイズ名では買えないので、売り場の呼び名に添える。 */
const HOLES: Readonly<Record<BoardSize, number>> = { mini: 170, half: 400, full: 830 };

/**
 * 板の行。**サイズと穴数**を書き、電源レールは既定 (mini は無し、half / full は有り)
 * と違うときだけ添える。印字 (`letters` `numbers`) は買う板を決めないので載せない。
 */
export function boardRow(board: Board): Row {
  const hasRails = board.rails !== null;
  const rails = hasRails === (board.size !== 'mini') ? '' : hasRails ? ' レール有り' : ' レール無し';
  return { id: '基板', type: 'breadboard', value: `${board.size} (${HOLES[board.size]} 穴)${rails}`, mark: '' };
}

/**
 * IC には働きを添える (`CD4081 (2 入力 AND ×4)`)。型番だけだと、どの IC が何をするのか
 * 表から読めない。機器の名札には添えない。
 */
const rowsOf = (parts: readonly PlacedPart[]): readonly Row[] =>
  parts.map((part) => part.kind === 'device'
    ? { id: part.id, type: typeOf(part), value: valueOf(part), mark: '' }
    : { id: part.id, type: typeOf(part), value: valueWithRole(valueOf(part)), mark: partsMark(part.type, part.variant, part.value) });

const markWidth = (mark: PartsMark): number =>
  typeof mark === 'string'
    ? textWidth(mark)
    : mark.length === 0 ? 0 : mark.length * SWATCH.width + (mark.length - 1) * SWATCH.gap;

/** 帯の色の四角を並べる。白と黒も地と見分けられるよう、細い縁を付ける。 */
function swatches(x: number, baseline: number, colors: readonly string[], size: number, edge: string): string {
  const height = SWATCH.height * size;
  return colors
    .map((name, index) => element('rect', {
      x: num(x + index * (SWATCH.width + SWATCH.gap) * size), y: num(baseline - height),
      width: num(SWATCH.width * size), height: num(height),
      fill: bandColor(name), stroke: edge, 'stroke-width': 0.5,
    }))
    .join('');
}

const widest = (values: readonly string[]): number => Math.max(0, ...values.map(textWidth));

const lineHeight = (theme: RenderTheme): number => theme.metrics.textSize * LINE_RATIO;

/** 並べる行数。上限を超えたぶんは「ほかに N 件」の 1 行にまとめる。 */
const rowCount = (parts: number): number => (parts > LIMITS.listedParts ? LIMITS.listedParts + 1 : parts);

const plateHeight = (rows: number, theme: RenderTheme): number => {
  const { textSize } = theme.metrics;
  return textSize * PAD_RATIO * 2 + textSize + lineHeight(theme) * (rows - 1);
};

/** 部品リストが図の下に足す高さ (板 + 下の余白)。並べるものが無ければ 0。 */
export function partsListHeight(parts: readonly PlacedPart[], theme: RenderTheme, board: Board | null = null): number {
  // 見出しの 1 行と、板の 1 行を足す。
  return parts.length === 0 ? 0 : plateHeight(rowCount(parts.length) + 1 + (board === null ? 0 : 1), theme) + GAP;
}

/**
 * 図の下に貼る部品リスト。ID・種類・値を書いた順に 1 行ずつ並べる。
 * 同じ値でまとめたりはしない。図の中の `R1` と 1 対 1 で突き合わせるための表なので、
 * 行と部品がずれると用を成さない。
 */
export function renderPartsList(
  parts: readonly PlacedPart[],
  x: number,
  y: number,
  width: number,
  theme: RenderTheme,
  board: Board | null = null,
): string {
  if (parts.length === 0) return '';

  // 表から部品を探すので名前の順に並べる (数字は数として: R2 の次は R10)。上限で切る前に並べる。
  const sorted = [...parts].sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
  const listed = rowsOf(sorted.slice(0, LIMITS.listedParts));
  const hidden = parts.length - listed.length;
  // 先頭は見出し。板は最初に用意する物なので、名前の順には入れず見出しのすぐ下に置く。上限の数にも数えない。
  const rows = [HEADING_ROW, ...(board === null ? [] : [boardRow(board)]), ...listed];
  const { palette } = theme;
  const { textSize } = theme.metrics;
  const pad = textSize * PAD_RATIO;
  const line = lineHeight(theme);

  // 板は基板と同じ色で塗る。`board-color` を変えたときに印字の色が追従する仕掛け
  // (theme.ts の inkFor) にそのまま相乗りできるため。字の縁取りは cell が敷く。
  const plate = element('rect', {
    x: num(x), y: num(y), width: num(width), height: num(plateHeight(rows.length + (hidden === 0 ? 0 : 1), theme)), rx: 6,
    fill: palette.plate, stroke: palette.plateEdge,
  });

  // 列の幅は左から順に、板に残っている幅で頭打ちにして決める。こうしておくと
  // どれか 1 つが長すぎても、右の列が板の外に押し出されることはない。
  const inked = x + width - pad;
  const room = (columnX: number): number => Math.max(0, (inked - columnX) / textSize);

  const idX = x + pad;
  // ID は図の部品と突き合わせるための鍵なので切らない。フェンスから来る ID は
  // 英数字 32 文字までで、いちばん狭い板でも収まる (room はコアの API を直に
  // 呼ばれたときの保険で、フェンス経由では効かない)。
  const idWidth = Math.min(widest(rows.map((row) => row.id)), room(idX));

  const typeX = idX + (idWidth + COLUMN_GAP) * textSize;
  const typeRoom = room(typeX);
  const typeWidth = Math.min(widest(rows.map((row) => row.type)), MAX_TYPE_WIDTH, typeRoom);

  const valueX = typeX + (typeWidth + COLUMN_GAP) * textSize;
  const valueRoom = room(valueX);
  const valueWidth = Math.min(widest(rows.map((row) => row.value)), valueRoom);

  const markX = valueX + (valueWidth + COLUMN_GAP) * textSize;
  const markRoom = room(markX);

  const baselineOf = (index: number): number => y + pad + textSize * CAP_RATIO + line * index;
  // 縁取りは図のキャプションと同じものを敷く。`style` の `text-color` は板ではなく
  // この縁取りとの対比で読ませる指定なので、外すとリストだけが地に沈む。
  // リストは板の上の字ではなく読む表なので、透かさず地に対して一番濃い色 (黒か白) で書く。
  const ink = isLight(palette.plate) ? '#000000' : '#ffffff';
  const cell = (cellX: number, baseline: number, text: string, fill: string): string =>
    svgText(cellX, baseline, text, {
      'font-size': num(textSize),
      fill,
      anchor: 'start',
      halo: palette.textHalo,
      haloWidth: TEXT_HALO_WIDTH * textScale(theme),
      haloOpacity: BOARD_HALO_OPACITY, inkOpacity: 1,
    });

  const cells = rows.flatMap((row, index) => {
    const baseline = baselineOf(index);
    return [
      cell(idX, baseline, fit(row.id, idWidth), ink),
      // 板に幅が残っていない列は諦める。ID を切ると図の部品と突き合わせられなく
      // なるが、種類と値のほうは図 (部品の形とキャプション `R1 330`) にも出ている。
      ...(typeRoom < MIN_COLUMN_WIDTH ? [] : [cell(typeX, baseline, fit(row.type, typeWidth), ink)]),
      ...(row.value === '' || valueRoom < MIN_COLUMN_WIDTH
        ? []
        : [cell(valueX, baseline, fit(row.value, valueRoom), ink)]),
      ...(row.mark.length === 0 || markRoom < MIN_COLUMN_WIDTH || markWidth(row.mark) > markRoom
        ? []
        : [typeof row.mark === 'string'
          ? cell(markX, baseline, row.mark, ink)
          : swatches(markX, baseline, row.mark, textSize, ink)]),
    ];
  });

  // 収まらなかったぶんは黙って落とさず、件数を最後の行に出す。
  const more = hidden === 0 ? '' : cell(idX, baselineOf(rows.length), `ほかに ${hidden} 件`, ink);

  return plate + cells.join('') + more;
}
