import { parseResistor, resistorBands } from 'fence-kit';
import { colorValue } from '../color.ts';
import type { Band } from '../model/layout.ts';
import type { DeviceSpec } from '../types.ts';
import { monoBandHeight, monoBaseline, monoText, monoWidth } from './monoBand.ts';
import type { Theme } from './theme.ts';

/**
 * 部品表 (`- parts`)。**買う・箱から選ぶときに見る一覧**を図の下に出す。
 *
 * 図には番地と値が散らばっているので、何をいくつ用意すればよいかは
 * 図を目で拾わないと分からない。**図と同じフェンスから出す**ので、
 * 部品を足したのに表を直し忘れる、が起きない。
 *
 * **抵抗にはカラーコードを字で添える** (`10k` → `茶黒橙金`)。実物を選ぶときに
 * 見るのは帯の色そのもので、図の帯は小さく、白黒で刷ると消える。
 * 字にしておけば、図を刷っても手元の部品と読み合わせられる。
 *
 * 板の外の機器も並べる。**盤面に載らないだけで、揃えるものには変わりない。**
 *
 * **桁は空白で埋めない。** 全角と半角が混じる表を空白で揃えると、フォントに
 * よって全角が 2 桁ぶんに収まらず列がずれる。列ごとに測って置き場所を決める
 * (帯の組み方そのものは `monoBand.ts`)。
 */

/**
 * カラーコードの帯の色の名前。**実物を選ぶときに使う日本語の呼び名**で、
 * 図の中の色 (`fence-kit` の `BAND_COLORS`) と 1 対 1 に対応する。
 * ここに無い名前が来たら英語のまま出す (黙って落とすと帯の本数が変わる)。
 */
const BAND_NAMES: Record<string, string> = {
  black: '黒',
  brown: '茶',
  red: '赤',
  orange: '橙',
  yellow: '黄',
  green: '緑',
  blue: '青',
  violet: '紫',
  gray: '灰',
  white: '白',
  gold: '金',
  silver: '銀',
};

const bandName = (name: string): string =>
  Object.hasOwn(BAND_NAMES, name) ? BAND_NAMES[name] ?? name : name;

/**
 * 抵抗のカラーコードを字にする。**値として読めないときは何も出さない** —
 * 実物と違う帯を書くと、図を信じた人が違う抵抗を挿す (図の帯と同じ約束)。
 */
export function bandText(type: string, value: string | null): string {
  if (type !== 'resistor' || value === null) return '';

  const read = parseResistor(value);
  if (read === null) return '';

  const bands = resistorBands(read.ohms, { tolerance: read.tolerance, tempco: read.tempco });
  return bands === null ? '' : bands.map(bandName).join('');
}

/**
 * 部品表に要るところだけ。**板に載せる前の部品**から作れる形にしておく —
 * 帯の大きさは図を組む前に測るので、置き場所が決まるのを待てない。
 */
export type ListedPart = {
  readonly id: string;
  readonly type: string;
  readonly variant: string | null;
  readonly value: string | null;
};

/** 部品表の 1 行ぶん。列に分けて持ち、幅を測ってから置き場所を決める。 */
export type PartsRow = readonly [id: string, kind: string, value: string, bands: string];

const HEADINGS: PartsRow = ['部品', '種類', '値', '色'];

/** 種類の綴り。姿を書いてあれば添える (`capacitor/ceramic`)。 */
const kindOf = (type: string, variant: string | null): string =>
  variant === null ? type : `${type}/${variant}`;

/**
 * 部品表の行。**書いた順に並べる** — 番号で並べ直すと、図を追いながら表を
 * 読む人が行を見失う (`R1` `R2` は書いた順に置いてあることが多い)。
 * 先頭は見出し — 番号と型番だけが並ぶと、どの欄が値なのかが読めない。
 */
export function partsListing(
  parts: readonly ListedPart[],
  devices: readonly DeviceSpec[],
): readonly PartsRow[] {
  const rows: PartsRow[] = [
    ...parts.map((part): PartsRow =>
      [part.id, kindOf(part.type, part.variant), part.value ?? '', bandText(part.type, part.value)]),
    // 機器は種類が 1 つしかないので、名札を値の欄に出す (`電池 3V`)。
    ...devices.map((device): PartsRow => [device.id, 'device', device.label, '']),
  ];
  return rows.length === 0 ? [] : [HEADINGS, ...rows];
}

/** 列の間。1 桁だと隣の欄と地続きに見えるので 2 桁ぶん空ける。 */
const GAP = '  ';

/** 列ごとの幅と、帯の左から測った左端。 */
function columns(rows: readonly PartsRow[], size: number): readonly { x: number; width: number }[] {
  const gap = monoWidth(GAP, size);
  let x = 0;
  return [0, 1, 2, 3].map((column) => {
    const width = Math.max(...rows.map((row) => monoWidth(row[column] ?? '', size)));
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
        .map((cell, column) =>
          cell === '' ? '' : monoText(band.x + (laid[column]?.x ?? 0), y, cell, { fill, size }))
        .join('');
    })
    .join('');
}
