import { PARTS_HEADINGS, bandColor, lookupNamedChip, partKind, partsMark, valueWithRole } from 'fence-kit';
import type { PartsMark } from 'fence-kit';
import { colorValue } from '../color.ts';
import type { Band } from '../model/layout.ts';
import type { Board, DeviceSpec } from '../types.ts';
import { monoBandHeight, monoBaseline, monoText, monoWidth } from './monoBand.ts';
import type { Theme } from './theme.ts';

/** 欄の中身 (種類・値・色・記号) は fence-kit に置き、breadboard の部品表と同じ字で出す。 */
export { bandColors, capacitorMark } from 'fence-kit';
export type { PartsMark } from 'fence-kit';

/**
 * 部品表 (`- parts`)。**買う・箱から選ぶときに見る一覧**を図の下に出す。
 *
 * 図には番地と値が散らばっているので、何をいくつ用意すればよいかは
 * 図を目で拾わないと分からない。**図と同じフェンスから出す**ので、
 * 部品を足したのに表を直し忘れる、が起きない。
 *
 * **抵抗にはカラーコードを実際の色の四角で添える** (`10k` → 茶・黒・橙・茶の四角)。実物を
 * 選ぶときに見るのは帯の色そのもので、図の帯は小さくて読みにくい。
 * **コンデンサには胴に刷ってある 3 桁の記号を添える** (`100n` → `104`)。
 *
 * 基板の外の機器も並べる。**盤面に載らないだけで、揃えるものには変わりない。**
 *
 * **桁は空白で埋めない。** 全角と半角が混じる表を空白で揃えると、フォントに
 * よって全角が 2 桁ぶんに収まらず列がずれる。列ごとに測って置き場所を決める
 * (帯の組み方そのものは `monoBand.ts`)。
 */

/**
 * 部品表に要るところだけ。**基板に載せる前の部品**から作れる形にしておく —
 * 帯の大きさは図を組む前に測るので、置き場所が決まるのを待てない。
 */
export type ListedPart = {
  readonly id: string;
  readonly type: string;
  readonly variant: string | null;
  readonly value: string | null;
};

/** 部品表の 1 行ぶん。列に分けて持ち、幅を測ってから置き場所を決める。 */
export type PartsRow = readonly [id: string, kind: string, value: string, mark: PartsMark];

const HEADINGS: PartsRow = PARTS_HEADINGS;

/**
 * 部品表の行。**書いた順に並べる** — 番号で並べ直すと、図を追いながら表を
 * 読む人が行を見失う (`R1` `R2` は書いた順に置いてあることが多い)。
 * 先頭は見出し — 番号と型番だけが並ぶと、どの欄が値なのかが読めない。
 */
/**
 * 基板の行。**買うときに要る値**だけを、売り場の表記の順に並べる (呼び名・穴数・厚さ・基材)。
 * 書かなかった厚さと基材も既定のまま出す — 表は買う物の一覧で、既定の基板も買う基板。
 * 色は手元の基板に図を寄せる設定なので載せない。
 */
export function boardRow(board: Board, name: string | null): PartsRow {
  const holes = `${board.cols}×${board.rows} 穴`;
  const size = name === null ? holes : `${name} (${holes})`;
  return ['基板', 'perfboard', `${size} ${board.h}mm ${board.material}`, ''];
}

export function partsListing(
  parts: readonly ListedPart[],
  devices: readonly DeviceSpec[],
  board: PartsRow | null = null,
): readonly PartsRow[] {
  const rows: PartsRow[] = [
    ...parts.map((part): PartsRow =>
      [part.id, partKind(part.type, part.variant, part.value),
        valueWithRole(part.value ?? lookupNamedChip(part.type, part.variant)?.name ?? ''), partsMark(part.type, part.variant, part.value)]),
    // 機器は種類が 1 つしかないので、名札を値の欄に出す (`電池 3V`)。
    ...devices.map((device): PartsRow => [device.id, 'device', device.label, '']),
  ];
  // 表から部品を探すので名前の順に並べる (数字は数として: R2 の次は R10。機器も同じ並びに入る)。
  const sorted = [...rows].sort((a, b) => a[0].localeCompare(b[0], 'en', { numeric: true }));
  // 基板は最初に用意する物なので、名前の順には入れず見出しのすぐ下に置く。部品が無ければ表ごと出さない。
  return sorted.length === 0 ? [] : [HEADINGS, ...(board === null ? [] : [board]), ...sorted];
}

/** 列の間。1 桁だと隣の欄と地続きに見えるので 2 桁ぶん空ける。 */
const GAP = '  ';

/** 帯の色の四角。1 本ぶんの幅と間 (字の大きさに対する比)。高さは字の高さに合わせる。 */
const SWATCH = { width: 0.9, gap: 0.25, height: 0.8 } as const;

const swatchesWidth = (count: number, size: number): number =>
  count === 0 ? 0 : count * SWATCH.width * size + (count - 1) * SWATCH.gap * size;

const cellWidth = (cell: PartsMark, size: number): number =>
  typeof cell === 'string' ? monoWidth(cell, size) : swatchesWidth(cell.length, size);

/** 帯の色の四角を並べる。白と黒も地と見分けられるよう、細い縁を付ける。 */
function renderSwatches(x: number, baseline: number, colors: readonly string[], size: number, edge: string): string {
  const height = SWATCH.height * size;
  const y = baseline - height;
  return colors
    .map((name, index) => {
      const left = x + index * (SWATCH.width + SWATCH.gap) * size;
      return `<rect x="${left.toFixed(2)}" y="${y.toFixed(2)}" width="${(SWATCH.width * size).toFixed(2)}" height="${height.toFixed(2)}" fill="${bandColor(name)}" stroke="${edge}" stroke-width="0.5"/>`;
    })
    .join('');
}

/** 列ごとの幅と、帯の左から測った左端。 */
function columns(rows: readonly PartsRow[], size: number): readonly { x: number; width: number }[] {
  const gap = monoWidth(GAP, size);
  let x = 0;
  return [0, 1, 2, 3].map((column) => {
    const width = Math.max(...rows.map((row) => cellWidth(row[column] ?? '', size)));
    const here = { x, width };
    x += width + gap;
    return here;
  });
}

export function partsListSize(
  rows: readonly PartsRow[],
  theme: Theme,
): { readonly width: number; readonly height: number } {
  if (rows.length === 0) return { width: 0, height: 0 };

  const size = theme.metrics.textSize;
  const last = columns(rows, size)[3];
  return {
    // **切り上げる。** 端数のままだと、丸め誤差でいま測った当の行が `…` に切られる。
    width: Math.ceil((last?.x ?? 0) + (last?.width ?? 0)),
    height: monoBandHeight(rows.length, size),
  };
}

export function renderPartsList(
  rows: readonly PartsRow[],
  band: Band,
  theme: Theme,
  color: string | null,
): string {
  if (rows.length === 0) return '';

  const size = theme.metrics.textSize;
  const fill = (color === null ? null : colorValue(color)) ?? theme.palette.caption;
  const laid = columns(rows, size);

  return rows
    .map((row, index) => {
      const y = monoBaseline(band, size, index);
      return row
        .map((cell, column) => {
          const x = band.x + (laid[column]?.x ?? 0);
          if (typeof cell !== 'string') return renderSwatches(x, y, cell, size, fill);
          return cell === '' ? '' : monoText(x, y, cell, { fill, size });
        })
        .join('');
    })
    .join('');
}
