import { LIMITS } from '../limits.ts';
import { fit, textWidth } from './textFit.ts';
import type { PlacedPart } from '../types.ts';
import { TEXT_HALO_WIDTH, element, num, svgText } from './svg.ts';
import type { RenderTheme } from './theme.ts';
import { textScale } from './theme.ts';

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

type Row = { readonly id: string; readonly type: string; readonly value: string };

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
  part.variant === null ? part.type : `${part.type}/${part.variant}`;

const rowsOf = (parts: readonly PlacedPart[]): readonly Row[] =>
  parts.map((part) => ({ id: part.id, type: typeOf(part), value: valueOf(part) }));

const widest = (values: readonly string[]): number => Math.max(0, ...values.map(textWidth));

const lineHeight = (theme: RenderTheme): number => theme.metrics.textSize * LINE_RATIO;

/** 並べる行数。上限を超えたぶんは「ほかに N 件」の 1 行にまとめる。 */
const rowCount = (parts: number): number => (parts > LIMITS.listedParts ? LIMITS.listedParts + 1 : parts);

const plateHeight = (rows: number, theme: RenderTheme): number => {
  const { textSize } = theme.metrics;
  return textSize * PAD_RATIO * 2 + textSize + lineHeight(theme) * (rows - 1);
};

/** 部品リストが図の下に足す高さ (板 + 下の余白)。並べるものが無ければ 0。 */
export function partsListHeight(parts: readonly PlacedPart[], theme: RenderTheme): number {
  return parts.length === 0 ? 0 : plateHeight(rowCount(parts.length), theme) + GAP;
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
): string {
  if (parts.length === 0) return '';

  const rows = rowsOf(parts.slice(0, LIMITS.listedParts));
  const hidden = parts.length - rows.length;
  const { palette } = theme;
  const { textSize } = theme.metrics;
  const pad = textSize * PAD_RATIO;
  const line = lineHeight(theme);

  // 板は基板と同じ色で塗る。`board-color` を変えたときに印字の色が追従する仕掛け
  // (theme.ts の inkFor) にそのまま相乗りできるため。字の縁取りは cell が敷く。
  const plate = element('rect', {
    x: num(x), y: num(y), width: num(width), height: num(plateHeight(rowCount(parts.length), theme)), rx: 6,
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

  const baselineOf = (index: number): number => y + pad + textSize * CAP_RATIO + line * index;
  // 縁取りは図のキャプションと同じものを敷く。`style` の `text-color` は板ではなく
  // この縁取りとの対比で読ませる指定なので、外すとリストだけが地に沈む。
  const cell = (cellX: number, baseline: number, text: string, fill: string): string =>
    svgText(cellX, baseline, text, {
      'font-size': num(textSize),
      fill,
      anchor: 'start',
      halo: palette.textHalo,
      haloWidth: TEXT_HALO_WIDTH * textScale(theme),
    });

  const cells = rows.flatMap((row, index) => {
    const baseline = baselineOf(index);
    return [
      cell(idX, baseline, fit(row.id, idWidth), palette.partText),
      // 板に幅が残っていない列は諦める。ID を切ると図の部品と突き合わせられなく
      // なるが、種類と値のほうは図 (部品の形とキャプション `R1 330`) にも出ている。
      // 種類は板の印字と同じ色に落とす。目で追うのは ID と値なので、その間で沈ませる。
      ...(typeRoom < MIN_COLUMN_WIDTH ? [] : [cell(typeX, baseline, fit(row.type, typeWidth), palette.label)]),
      ...(row.value === '' || valueRoom < MIN_COLUMN_WIDTH
        ? []
        : [cell(valueX, baseline, fit(row.value, valueRoom), palette.partText)]),
    ];
  });

  // 収まらなかったぶんは黙って落とさず、件数を最後の行に出す。
  const more = hidden === 0 ? '' : cell(idX, baselineOf(rows.length), `ほかに ${hidden} 件`, palette.label);

  return plate + cells.join('') + more;
}
