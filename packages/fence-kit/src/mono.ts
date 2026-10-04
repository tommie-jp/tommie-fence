import { fit, textWidth } from './textFit.ts';
import { num, svgText } from './svg.ts';

/**
 * 図の下に等幅で並べる帯 (読み値の表・部品表・書き出し)。**perfboard・copper・vna の
 * 3 つが同じ組み方を写して持っていた**ので引き上げた (scope が 4 つ目)。
 *
 * **行送りと余白だけがフェンスで違う** (`MonoSpacing`)。ブレッドボードとユニバーサル基板は 1.15 と 8、
 * 計器の画面 (vna・scope) は表を読むので 1.35 と 6。違いは理由があって残した
 * (揃えると描いてある図が動く)。
 */

/** 等幅で書く。図のほかの字とは別の family を使う (桁が揃わないと読みにくい)。 */
export const MONO_FAMILY = "ui-monospace, 'DejaVu Sans Mono', 'Noto Sans Mono CJK JP', monospace";

/**
 * 等幅の 1 字は、比例フォント向けの見積もり (`textWidth`) より広い。
 * **全角に合わせて 1.2 倍**で数える。広く見積もるほうが安全 — 多ければ帯が少し
 * 広いだけ、少なければ画布からはみ出して黙って切れる。
 */
export const MONO_WIDEN = 1.2;

export type MonoSpacing = {
  /** 行送り (字の大きさに対する倍率)。 */
  readonly leading: number;
  /** 帯の上下に入れる余白。 */
  readonly pad: number;
};

export type MonoBand = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
export type MonoSize = { readonly width: number; readonly height: number };

/** 等幅で置いたときの字の幅 (px)。**測るときも切るときも同じ数を使う。** */
export const monoWidth = (text: string, size: number): number => textWidth(text) * size * MONO_WIDEN;

/** 帯が要る高さ。行の数だけで決まる。 */
export const monoBandHeight = (rows: number, size: number, spacing: MonoSpacing): number =>
  (rows === 0 ? 0 : size * spacing.leading * (rows - 1) + size + spacing.pad * 2);

/** 帯の中の n 行目のベースライン。 */
export const monoBaseline = (y: number, size: number, index: number, spacing: MonoSpacing): number =>
  y + spacing.pad + size * 0.8 + size * spacing.leading * index;

/**
 * 等幅の字を 1 つ置く。`room` を渡すとその幅で切る (`…` を残す)。
 * 字下げは意味そのものなので、空白を詰めさせない。
 */
export const monoText = (
  x: number,
  y: number,
  text: string,
  options: { readonly fill: string; readonly size: number; readonly room?: number },
): string =>
  svgText(x, y, options.room === undefined ? text : fit(text, options.room / (options.size * MONO_WIDEN)), {
    anchor: 'start',
    fill: options.fill,
    'font-size': num(options.size),
    'font-family': MONO_FAMILY,
    'xml:space': 'preserve',
  });

/** 1 行を丸ごと写す帯の大きさ。**切り上げる** (端数のままだと測った当の行が `…` に切られる)。 */
export function monoLinesSize(lines: readonly string[], size: number, spacing: MonoSpacing): MonoSize {
  if (lines.length === 0) return { width: 0, height: 0 };
  return {
    width: Math.ceil(Math.max(...lines.map((line) => monoWidth(line, size)))),
    height: monoBandHeight(lines.length, size, spacing),
  };
}

/** 1 行を丸ごと写す帯。帯の幅で切る。 */
export function renderMonoLines(
  lines: readonly string[],
  band: MonoBand,
  options: { readonly size: number; readonly fill: string; readonly spacing: MonoSpacing },
): string {
  const { size, fill, spacing } = options;
  return lines.map((line, index) =>
    monoText(band.x, monoBaseline(band.y, size, index, spacing), line, { fill, size, room: band.width })).join('');
}

const GAP = '  ';

/** 表の列の位置。**列ごとに一番長い字で幅を決める** (等幅なので揃う)。 */
function tableColumns(rows: readonly (readonly string[])[], size: number): readonly number[] {
  const count = Math.max(0, ...rows.map((row) => row.length));
  let x = 0;
  return Array.from({ length: count }, (_, column) => {
    const here = x;
    x += Math.max(...rows.map((row) => monoWidth(row[column] ?? '', size))) + monoWidth(GAP, size);
    return here;
  });
}

/**
 * 表を字の行に直す (CLI の `--verbose` と同じ並び)。**端末の桁で揃える** —
 * 桁の数え方 (`widthOf`。全角は 2 桁) はフェンスの報告と同じ物を渡す。
 */
export function monoTableLines(rows: readonly (readonly string[])[], widthOf: (text: string) => number): readonly string[] {
  const count = Math.max(0, ...rows.map((row) => row.length));
  const widths = Array.from({ length: count }, (_, column) => Math.max(...rows.map((row) => widthOf(row[column] ?? ''))));
  return rows.map((row) => row.map((cell, column) =>
    (column === row.length - 1 ? cell : cell + ' '.repeat((widths[column] ?? 0) - widthOf(cell)))).join(GAP));
}

export function monoTableSize(rows: readonly (readonly string[])[], size: number, spacing: MonoSpacing): MonoSize {
  if (rows.length === 0) return { width: 0, height: 0 };
  const xs = tableColumns(rows, size);
  const lastColumn = xs.length - 1;
  const width = Math.max(...rows.map((row) => (xs[lastColumn] ?? 0) + monoWidth(row[lastColumn] ?? '', size)));
  return { width: Math.ceil(width), height: monoBandHeight(rows.length, size, spacing) };
}

/** 表を描く。**1 行目は見出し** (`head` の色で)。 */
export function renderMonoTable(
  rows: readonly (readonly string[])[],
  band: MonoBand,
  options: { readonly size: number; readonly head: string; readonly body: string; readonly spacing: MonoSpacing },
): string {
  const { size, head, body, spacing } = options;
  const xs = tableColumns(rows, size);
  return rows.flatMap((row, index) => row.map((cell, column) =>
    monoText(band.x + (xs[column] ?? 0), monoBaseline(band.y, size, index, spacing), cell,
      { fill: index === 0 ? head : body, size }))).join('');
}
