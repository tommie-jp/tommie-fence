import { element, num, parseResistor, resistorBands } from 'fence-kit';
import type { Band } from '../model/layout.ts';
import { colorName, hasHatch, hatchDash, hatchFill } from './hatch.ts';
import { monoBandHeight, monoBaseline, monoText, monoWidth } from './monoBand.ts';
import type { Theme } from './theme.ts';

/**
 * 色の凡例。**白黒で刷る図 (`theme: mono`) にだけ出る。**
 *
 * 白黒では色を網と線の型に移してある (`hatch.ts`)。移した先が何色なのかを
 * 図の中では言えないので、引き当てる表を図の下に出す。
 *
 * **図が使った色だけ**を並べる。使っていない色まで並べると、表のほうが図より
 * 長くなり、どれを探せばよいのか分からなくなる。
 */

/** 見本の線の長さと、網の四角の大きさ。 */
const LINE = 22;
const SWATCH_WIDTH = 14;
const SWATCH_HEIGHT = 9;
/** 見本と名前の間、項目と項目の間。 */
const INNER = 5;
const BETWEEN = 16;
/** 帯の頭に置く見出し。**線にも面にも掛かる**ので「線の色」とは書かない。 */
const HEADING = '色';

/** 1 項目の幅。見本 2 つと名前。 */
const entryWidth = (color: string, size: number): number =>
  LINE + INNER + SWATCH_WIDTH + INNER + monoWidth(colorName(color), size);

/**
 * 図の中で色として出るもの。**配線の色・LED の色・抵抗のカラーコード**の 3 つ。
 * 白黒の図ではどれも網に移るので、引き当てる表もこの 3 つから作る。
 *
 * 板や胴の色はここに入れない — あれは**テーマが動かす見た目**で、意味を
 * 持っていない (凡例に並べても引くものがない)。
 */
export function paintedColors(doc: {
  readonly wires: readonly { readonly color: string | null }[];
  readonly parts: readonly { readonly type: string; readonly value: string | null }[];
}): readonly (string | null)[] {
  const bandsOf = (value: string | null): readonly string[] => {
    const read = value === null ? null : parseResistor(value);
    if (read === null) return [];
    return resistorBands(read.ohms, { tolerance: read.tolerance, tempco: read.tempco }) ?? [];
  };

  const painted: (string | null)[] = doc.wires.map((wire) => wire.color);
  for (const part of doc.parts) {
    if (part.type === 'led') painted.push(part.value?.toLowerCase() ?? null);
    if (part.type === 'resistor') painted.push(...bandsOf(part.value));
  }
  return painted;
}

/**
 * 凡例に並べる色。**書かれた順に、重なりを畳んで**返す — 並べ直すと、
 * 図の上から下へ線を追ってきた目が表の中で行を探すことになる。
 */
export const legendColors = (used: readonly (string | null)[]): readonly string[] => {
  const seen = new Set<string>();
  return used.flatMap((color) =>
    color === null || seen.has(color) || !hasHatch(color) ? [] : (seen.add(color), [color]));
};

/**
 * 項目を行に割る。**板の幅で折り返す** — 色を多く使った図で 1 行に伸ばすと、
 * 凡例のために画布が板の何倍にもなる。見出しは 1 行目の頭にだけ置く。
 */
function wrapped(
  colors: readonly string[],
  size: number,
  room: number,
): readonly (readonly { readonly color: string; readonly x: number }[])[] {
  const head = monoWidth(HEADING, size) + BETWEEN;
  const rows: { color: string; x: number }[][] = [];
  let row: { color: string; x: number }[] = [];
  let x = head;

  for (const color of colors) {
    const width = entryWidth(color, size);
    // 1 項目も入らない幅でも、必ず 1 つは置く (置かないと凡例が消える)。
    if (row.length > 0 && x + width > room) {
      rows.push(row);
      row = [];
      x = head;
    }
    row.push({ color, x });
    x += width + BETWEEN;
  }
  if (row.length > 0) rows.push(row);
  return rows;
}

export function legendSize(
  colors: readonly string[],
  theme: Theme,
  room: number,
): { readonly width: number; readonly height: number } {
  if (colors.length === 0) return { width: 0, height: 0 };

  const size = theme.metrics.textSize;
  const rows = wrapped(colors, size, room);
  const width = Math.max(...rows.map((cells) => {
    const last = cells[cells.length - 1];
    return last === undefined ? 0 : last.x + entryWidth(last.color, size);
  }));
  return { width: Math.ceil(width), height: monoBandHeight(rows.length, size) };
}

/**
 * 凡例を 1 行に並べる。**線の型と網の両方を見せる** — 配線からも部品からも
 * 同じ表を引けるようにするため (線でしか使っていない色でも、網は出しておく)。
 */
export function renderLegend(
  colors: readonly string[],
  band: Band,
  theme: Theme,
  room: number,
): string {
  if (colors.length === 0) return '';

  const size = theme.metrics.textSize;
  const ink = theme.palette.caption;

  const drawn = wrapped(colors, size, room)
    .map((cells, line) => {
      const y = monoBaseline(band, size, line);
      // 見本は字のベースラインではなく、字の高さの真ん中に置く。
      const middle = y - size * 0.3;
      return cells
        .map(({ color, x: at }) => {
          const x = band.x + at;
          const dash = hatchDash(color);
          const sample = element('line', {
            x1: num(x), y1: num(middle), x2: num(x + LINE), y2: num(middle),
            stroke: ink, 'stroke-width': 3, 'stroke-linecap': 'butt',
            ...(dash === '' ? {} : { 'stroke-dasharray': dash }),
          });
          const swatchX = x + LINE + INNER;
          const swatch = element('rect', {
            x: num(swatchX), y: num(middle - SWATCH_HEIGHT / 2),
            width: SWATCH_WIDTH, height: SWATCH_HEIGHT,
            fill: hatchFill(color, ink), stroke: ink, 'stroke-width': 0.6,
          });
          return sample + swatch
            + monoText(swatchX + SWATCH_WIDTH + INNER, y, colorName(color), { fill: ink, size });
        })
        .join('');
    })
    .join('');

  return monoText(band.x, monoBaseline(band, size, 0), HEADING, { fill: ink, size }) + drawn;
}
