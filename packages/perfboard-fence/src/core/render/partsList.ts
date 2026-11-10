import { PARTS_SYMBOL_HEADING_BY_LANG, bandColor, lookupNamedChip, partKind, partsMark, valueWithRole, withRatings } from 'fence-kit';
import type { Lang, PartRatings, PartsMark } from 'fence-kit';
import { colorValue } from '../color.ts';
import { SOCKET_LOOK } from '../parts/types.ts';
import type { Band, Layout } from '../model/layout.ts';
import type { Board, DeviceSpec, PlacedPart } from '../types.ts';
import { partsIcon } from './partsListIcons.ts';
import type { PartsIcon } from './partsListIcons.ts';
import { monoText, monoWidth } from './monoBand.ts';
import { textLabels } from './textLabels.ts';
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
  /** IC ソケットに挿した DIP。種類の欄に `/socket` を添える。 */
  readonly socket?: boolean;
  /** 書かれたままの穴 (`b3`)。位置の欄に出す。 */
  readonly holes?: readonly string[];
  /** 定格・想定値 (`i=3mA` など)。値の欄に添える。 */
  readonly ratings?: PartRatings | null;
};

/** 部品表の 1 行ぶん。列に分けて持ち、幅を測ってから置き場所を決める。 */
export type PartsRow = readonly [id: string, kind: string, value: string, mark: PartsMark, position?: string];

/** これを超えるピンの部品は全部を並べず、最初のピンだけを出す (breadboard と同じ)。 */
const LISTED_PINS = 3;

/** 図の中の位置 (`b3,b7`)。穴を書かない部品は空。 */
const positionOf = (holes: readonly string[]): string =>
  (holes.length > LISTED_PINS ? holes.slice(0, 1) : holes).join(',');



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
export function boardRow(board: Board, name: string | null, lang: Lang = 'ja'): PartsRow {
  const labels = textLabels(lang);
  const holes = labels.holes(board.cols, board.rows);
  const size = name === null ? holes : `${name} (${holes})`;
  return [labels.board, 'perfboard', `${size} ${board.h}mm ${board.material}`, ''];
}

export function partsListing(
  parts: readonly ListedPart[],
  devices: readonly DeviceSpec[],
  board: PartsRow | null = null,
  lang: Lang = 'ja',
): readonly PartsRow[] {
  const rows: PartsRow[] = [
    ...parts.map((part): PartsRow => {
      const row = [part.id, partKind(part.type, part.socket === true ? SOCKET_LOOK : part.variant, part.value, lang),
        withRatings(valueWithRole(part.value ?? lookupNamedChip(part.type, part.variant)?.name ?? '', lang), part.ratings),
        partsMark(part.type, part.variant, part.value)] as const;
      return part.holes === undefined ? row : [...row, positionOf(part.holes)];
    }),
    // 機器は種類が 1 つしかないので、名札を値の欄に出す (`電池 3V`)。
    ...devices.map((device): PartsRow => [device.id, 'device', device.label, '']),
  ];
  // 表から部品を探すので名前の順に並べる (数字は数として: R2 の次は R10。機器も同じ並びに入る)。
  const sorted = [...rows].sort((a, b) => a[0].localeCompare(b[0], 'en', { numeric: true }));
  // 基板は最初に用意する物なので、名前の順には入れず見出しのすぐ下に置く。部品が無ければ表ごと出さない。
  return sorted.length === 0 ? [] : [textLabels(lang).headings, ...(board === null ? [] : [board]), ...sorted];
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

/** 列ごとの幅と、帯の左から測った左端。**絵の欄では値の次に位置の欄を挟む** (`laid[4]` が位置)。 */
function columns(rows: readonly PartsRow[], size: number, symbols = false): readonly { x: number; width: number }[] {
  const gap = monoWidth(GAP, size);
  let x = 0;
  const laid: { x: number; width: number }[] = [];
  for (const column of symbols ? [0, 1, 2, 4, 3] : [0, 1, 2, 3]) {
    const width = Math.max(...rows.map((row) => cellWidth(row[column] ?? '', size)));
    laid[column] = { x, width };
    x += width + gap;
  }
  return laid;
}

/**
 * 部品の絵 (記号の欄)。**基板に描いたのと同じ関数・同じ大きさで描く** (`partsListIcons.ts`)。
 * 絵を持たない種類 (DIP・機器など) は入れない (欄が空になる)。ID で引く (表は名前の順に並べ直すので、
 * 並びでは合わせない)。`plate` は基板の部品のテーマ。
 */
export function partsIcons(parts: readonly PlacedPart[], layout: Layout, plate: Theme): ReadonlyMap<string, PartsIcon> {
  return new Map(parts.flatMap((part) => {
    const icon = partsIcon(part, layout, plate);
    return icon === null ? [] : [[part.id, icon] as const];
  }));
}

/** 部品表の帯の上下の余白 (px)。等幅の帯 (`monoBand.ts`) と同じ。 */
const LIST_PAD = 8;
/**
 * 行の送り (字の大きさに対する比)。**行と行の間を字の高さの 1/2** にする (breadboard の部品表と同じ。
 * 実機で頼まれた)。
 */
const LIST_LEADING = 1.5;
/** 絵は 2 行ぶんの高さに収め、1 行ごとに左右の列を交互に使う (breadboard と同じ)。 */
const ICON_ROWS = 2;
/** 同じ列の上下の絵との間に残す隙間 (px)。 */
const ICON_CLEARANCE = 1;
/** 左右の 2 列の間 (字の大きさに対する比)。 */
const ICON_COLUMN_GAP = 0.5;
/** 字の頭からベースラインまで (字の大きさに対する比)。等幅の帯と同じ。 */
const CAP = 0.8;
/**
 * 偶数行に敷く地 (字の色を透かす)。**奇数行が少し薄く見える**ようにする。部品表は基板の外の
 * 白い地に置くので、白をさらに薄くはできない。偶数行のほうを少しだけ沈める。
 */
const STRIPE_OPACITY = 0.06;

type Icons = ReadonlyMap<string, PartsIcon>;

/**
 * 行の送り。絵は基板と同じ大きさで縮めないので、**いちばん背の高い絵が 2 行ぶん (上下の隙間つき)
 * に収まる**まで広げる。
 */
const lineOf = (size: number, icons: Icons = new Map()): number => {
  const tallest = Math.max(0, ...[...icons.values()].map((icon) => icon.height));
  return Math.max(size * LIST_LEADING, (tallest + ICON_CLEARANCE * 2) / ICON_ROWS);
};

/** 帯の中の n 行目のベースライン。 */
const baselineOf = (band: Band, size: number, index: number, line: number): number =>
  band.y + LIST_PAD + size * CAP + line * index;

/** 絵の欄の幅 (左右 2 列ぶん)。いちばん幅のある絵で決める。 */
function iconColumnWidth(rows: readonly PartsRow[], icons: Icons, size: number): number {
  const widest = Math.max(0, ...rows.map((row) => icons.get(row[0])?.width ?? 0));
  return widest === 0 ? 0 : widest * 2 + ICON_COLUMN_GAP * size;
}

export function partsListSize(
  rows: readonly PartsRow[],
  theme: Theme,
  icons: Icons = new Map(),
): { readonly width: number; readonly height: number } {
  if (rows.length === 0) return { width: 0, height: 0 };

  const size = theme.metrics.textSize;
  const last = columns(rows, size, icons.size > 0)[3];
  const height = LIST_PAD * 2 + size + lineOf(size, icons) * (rows.length - 1);
  // 最後の行の絵は、字の行の真ん中から下へ絵の半分だけ伸びる。下の余白で足りなければ広げる。
  const lastIcon = icons.get(rows[rows.length - 1]?.[0] ?? '');
  const reach = (lastIcon?.height ?? 0) / 2 - (size * CAP) / 2 - (LIST_PAD + size * (1 - CAP));
  return {
    // **切り上げる。** 端数のままだと、丸め誤差でいま測った当の行が `…` に切られる。
    width: Math.ceil((last?.x ?? 0) + Math.max(last?.width ?? 0, iconColumnWidth(rows, icons, size))),
    height: height + (icons.size > 0 ? Math.max(0, reach + ICON_CLEARANCE) : 0),
  };
}

/** 絵を `<g class="pf-parts-icon">` で置く (入れ子の `<svg>` にしない。breadboard と同じ)。 */
const iconGroup = (icon: PartsIcon, left: number, top: number): string =>
  `<g class="pf-parts-icon" transform="translate(${left.toFixed(2)} ${top.toFixed(2)})">${icon.svg}</g>`;

/**
 * 部品表を描く。**記号の欄は図と同じ部品の絵** (2 行ぶんの高さで、1 行ごとに左右交互)。見出しは `記号`。
 * 絵の無い部品 (DIP・機器) は欄が空。`icons` を渡さなければ前の形 (帯の色の四角と記号の字) で描く。
 */
export function renderPartsList(
  rows: readonly PartsRow[],
  band: Band,
  theme: Theme,
  color: string | null,
  icons: Icons = new Map(),
  lang: Lang = 'ja',
): string {
  if (rows.length === 0) return '';

  const size = theme.metrics.textSize;
  const fill = (color === null ? null : colorValue(color)) ?? theme.palette.caption;
  const symbols = icons.size > 0;
  const laid = columns(rows, size, symbols);
  const line = lineOf(size, icons);
  const markX = band.x + (laid[3]?.x ?? 0);
  const widest = Math.max(0, ...[...icons.values()].map((icon) => icon.width));
  const secondX = markX + widest + ICON_COLUMN_GAP * size;
  const width = partsListSize(rows, theme, icons).width;

  // 偶数行 (見出しの下を 1 行目と数える) に薄い地。奇数行が少し薄く見える。字と絵より先に敷く。
  const stripes = symbols
    ? rows.slice(1).map((_, offset) => offset + 1).filter((index) => index % 2 === 0).map((index) => {
      const middle = baselineOf(band, size, index, line) - (size * CAP) / 2;
      return `<rect x="${band.x.toFixed(2)}" y="${(middle - line / 2).toFixed(2)}" width="${width.toFixed(2)}" height="${line.toFixed(2)}" fill="${fill}" fill-opacity="${STRIPE_OPACITY}"/>`;
    }).join('')
    : '';

  const cells = rows
    .map((row, index) => {
      const y = baselineOf(band, size, index, line);
      return row
        .map((cell, column) => {
          const x = band.x + (laid[column]?.x ?? 0);
          if (symbols && column === 3) {
            if (index === 0) return monoText(x, y, PARTS_SYMBOL_HEADING_BY_LANG[lang], { fill, size });
            const icon = icons.get(row[0]);
            if (icon === undefined) return '';
            const top = y - (size * CAP) / 2 - icon.height / 2;
            return iconGroup(icon, index % 2 === 0 ? markX : secondX, top);
          }
          if (cell === undefined || (column === 4 && !symbols)) return '';
          if (typeof cell !== 'string') return renderSwatches(x, y, cell, size, fill);
          return cell === '' ? '' : monoText(x, y, cell, { fill, size });
        })
        .join('');
    })
    .join('');
  // 見出しの行は fence-kit の 4 欄なので、位置の見出しはここで足す。
  const positionHeading = symbols && laid[4] !== undefined
    ? monoText(band.x + laid[4].x, baselineOf(band, size, 0, line), textLabels(lang).position, { fill, size })
    : '';
  return stripes + cells + positionHeading;
}
