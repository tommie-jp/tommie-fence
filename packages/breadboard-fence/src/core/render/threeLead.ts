import type { Layout } from '../model/layout.ts';
import type { PlacedPart } from '../types.ts';
import {
  LEG_NAME_CLEAR, NAME_CAP, NAME_LINE, caption, captionTextWidth, charWidth, fitToBoard, haloWidth, partLabel, pinPoints,
} from './partCommon.ts';
import { HOLE_ROWS } from '../types.ts';
import type { HoleRow, Point, Rect } from '../types.ts';
import { drawPackage, packageExtent, packageHalfWidth, packageReach } from 'fence-kit';
import { insertionDot } from './wires.ts';
import { BOARD_HALO_OPACITY, BOARD_INK_OPACITY, element, num, svgText } from './svg.ts';
import type { RenderTheme } from './theme.ts';

/**
 * 3 ピンの部品。**ピンの並びは真ん中のピンを中心に描く**。
 *
 * **パッケージの姿は fence-kit にある** (`parts/packages.ts`)。実物の話で基板に
 * 依らないので、perfboard と同じ絵になる (52 の docs/18)。ここに残るのは基板の
 * 話 — ピンの点、ピン名、キャプション、どちら側に寄せるか。
 * パッケージの向き (TO-92 の平らな面、スイッチの倒れている側) は図では主張しない。
 * 品種や状態で変わるものを図に描くと嘘になるので、どの穴がどのピンかをピン名で示す。
 */
export const bodyHalfHeight = (part: PlacedPart, layout: Layout): number =>
  packageReach(part, layout.pitch);

/**
 * 胴がピンの点から**上へ・下へ**伸びる量。多くの胴は上下対称だが、**TO-220 は写真と同じ向き
 * (ピンが下、放熱タブと樹脂が上)** で、胴は穴の行から上へだけ伸びる (`fence-kit` の
 * `packageExtent`)。配線よけ・名前・名札の置き場はここから取る。
 */
export const bodyUp = (part: PlacedPart, layout: Layout): number => packageExtent(part, layout.pitch).up;
export const bodyDown = (part: PlacedPart, layout: Layout): number => packageExtent(part, layout.pitch).down;

/**
 * 胴の横幅の半分。**丸い TO-92 以外は縦より横に広い**。
 * 配線がよける領域 (`render/parts.ts` の `partObstacles`) と、
 * 下のシェル描画の両方がここから幅を取る。**係数を 2 か所に持たない**:
 * 分けて持っていたころは障害物だけが丸の半径のままで、
 * 横に広い胴 (TO-220・半固定抵抗・スライドスイッチ) の上を配線が通っていた。
 */
export const bodyHalfWidth = (part: PlacedPart, layout: Layout): number =>
  packageHalfWidth(part, layout.pitch);

/**
 * 隣り合うピンの名前の間に空ける幅 (字の大きさを 1 とする)。くっつくと `in gndout` と
 * 1 語に読めた (教科書の三端子レギュレータの図)。
 */
const LEG_NAME_SPACE = 0.4;

/**
 * 太字の ASCII の送り幅 (字の大きさを 1 とした 100 分率。`!` から `~` まで)。
 * **DejaVu Sans Bold の値** — 字の並び (`BOLD_FAMILY`) の中で手元に来うる最も広い太字で、
 * PNG を焼く sharp (librsvg) と Linux のブラウザはこれで組む。Segoe UI・Arial の太字は
 * これより狭いので、広いほうで見積もれば重ならない。平均 (大文字 0.72・小文字 0.58) で
 * 見積もっていたころは、DejaVu で `in gnd out` が重なった。
 */
const BOLD_ADVANCE = [
  46, 52, 84, 70, 100, 87, 31, 46, 46, 52, 84, 38, 42, 38, 37, 70, 70, 70, 70, 70, 70, 70, 70, 70, 70, 40, 40,
  84, 84, 84, 58, 100, 77, 76, 73, 83, 68, 68, 82, 84, 37, 37, 77, 64, 100, 84, 85, 73, 85, 77, 72, 68, 81, 77,
  110, 77, 72, 73, 46, 37, 46, 84, 50, 50, 67, 72, 59, 72, 68, 44, 72, 71, 34, 34, 67, 34, 104, 71, 69, 72, 72,
  49, 60, 48, 71, 65, 92, 65, 65, 58, 71, 37, 71, 84,
] as const;

/** ASCII の外 (全角など) は字の大きさいっぱい。 */
const WIDE = 1;
const SPACE_ADVANCE = 0.35;

const boldCharWidth = (char: string): number => {
  const code = char.codePointAt(0) ?? 0;
  if (code === 0x20) return SPACE_ADVANCE;
  const advance = BOLD_ADVANCE[code - 0x21];
  return advance === undefined ? WIDE : advance / 100;
};

const boldWidth = (text: string): number => [...text].reduce((sum, char) => sum + boldCharWidth(char), 0);

/**
 * ピンの名前の字の大きさ。**隣のピンの名前とぶつかるときだけ縮める** — 3 ピンの IC
 * (`ic3`) や TO-220 は `Vout` `gnd` のような名前を隣り合う穴に書くので、既定の大きさでは
 * 重なる (DIP のピンの名前と同じくらいまで縮む)。1 文字の名前 (`B` `C` `E`) は収まるので
 * 既定のまま。縦に並んだピンは名前が横にずれないので縮めない。
 */
function legNameSize(names: readonly string[], xs: readonly number[], size: number): number {
  // **並べ替えてから差を取る** — ピンは書いた順に並ぶとは限らない (`h9 h12 h10`)。
  const sorted = [...xs].sort((a, b) => a - b);
  const gaps = sorted.slice(1).map((x, index) => x - (sorted[index] ?? x)).filter((gap) => gap > 0);
  if (gaps.length === 0) return size;
  const widest = Math.max(0, ...names.map(boldWidth)) + LEG_NAME_SPACE;
  const room = Math.min(...gaps);
  return widest * size <= room ? size : room / widest;
}

/** ピンが横 1 列に並んでいるか (縦に並んだピンは名前が横にずれないので、名札は従来どおり下)。 */
const inOneRow = (points: readonly Point[]): boolean =>
  points.every((point) => Math.abs(point.y - (points[0]?.y ?? point.y)) < 0.5);

/** 溝の上のブロック (a〜e) と下のブロック (f〜j)。 */
const BLOCKS: readonly (readonly HoleRow[])[] = [HOLE_ROWS.slice(0, 5), HOLE_ROWS.slice(5)];

type RowGap = { readonly above: number; readonly below: number };

/**
 * ピンの名前を置いてよい行間。**ピンと同じブロックの中の、隣り合う 2 行の間だけ** —
 * 外したのは 3 つで、どれも書き手の線がよく通るか、ピンから遠い:
 *
 * - 端の行 (a・j) とレールの間。列番号の帯で、ピンの列をレールへ降ろす電源と GND の線が
 *   ここを縦に通る (`j4 -- -b4`。i 行の TO-92 の `E` が列番号と GND の線に重なった)
 * - 溝。ピンの列を溝の向こうへ渡す線 (`e8 -- f8`) がここを縦に通る
 * - 溝の向こうのブロック。どの部品のピンの名前か読めない
 */
function rowGaps(layout: Layout, legY: number): RowGap[] {
  const rows = BLOCKS[legY < layout.ravineY ? 0 : 1] ?? [];
  const inBlock = rows.slice(1).map((row, index) => ({ above: layout.rowY(rows[index] ?? row), below: layout.rowY(row) }));
  return inBlock
    .filter((gap) => gap.above > 0 && gap.below > gap.above)
    .sort((a, b) => a.above - b.above);
}

export type LegNameLine = {
  readonly y: number;
  /** 穴の行と行の間に置いた (字の下の穴を伏せなくてよい)。 */
  readonly betweenRows: boolean;
  /** 胴の上に置いた (胴の下に行間が無かった)。名札を積むときは上へ積む。 */
  readonly above: boolean;
};

/**
 * ピンの名前の基準線。**穴の行と行の間**に字を収める — まず胴の下で最初に収まる行間
 * (`rowGaps`)、無ければ胴の上で最初に収まる行間。行間の真ん中に字の中心を置く。
 * 穴の行に掛けて書いていたので、ピンのすぐ下の行 (h 行のピンなら i 行) の穴が名前の字と
 * 縁取りの下に消えた。上にも下にも収まる行間が無ければ胴のすぐ下 (`betweenRows` は偽)。
 *
 * **胴の下を先に試す**のは、図の中で名前の出る側を揃えるため (実機で「すべての部品名は
 * 部品の下側に表示する」)。上へ回すのは、下が列番号の帯か溝しか無いとき (i 行・e 行の
 * TO-92) だけ。
 */
export function legNameLine(
  part: PlacedPart,
  legY: number,
  layout: Layout,
  theme: RenderTheme,
): LegNameLine {
  const cap = theme.metrics.textSize * NAME_CAP;
  const edge = haloWidth(theme) / 2;
  const hole = theme.metrics.holeSize / 2;
  // 胴の下の縁から離す最小 (今までと同じ)。これより上へは寄せない。
  const highest = legY + bodyDown(part, layout) + LEG_NAME_CLEAR + cap;
  // 胴の上の縁から離す最小。基準線がこれより下だと字が胴に掛かる。
  const lowest = legY - bodyUp(part, layout) - LEG_NAME_CLEAR;
  // **胴が上だけに伸びる TO-220 は、名前をいつもピンの下へ** (上へ回すと胴の上のタブの向こうに落ちる)。
  const belowOnly = bodyDown(part, layout) < bodyUp(part, layout);
  const fits = (y: number, gap: RowGap): boolean => y + edge <= gap.below - hole && y - cap - edge >= gap.above + hole;
  const gaps = rowGaps(layout, legY);

  for (const gap of gaps.filter((candidate) => candidate.above >= legY - 0.5)) {
    const y = Math.max((gap.above + gap.below) / 2 + cap / 2, highest);
    if (fits(y, gap)) return { y, betweenRows: true, above: false };
  }
  for (const gap of belowOnly ? [] : gaps.filter((candidate) => candidate.below <= legY + 0.5).reverse()) {
    const y = Math.min((gap.above + gap.below) / 2 + cap / 2, lowest);
    if (fits(y, gap)) return { y, betweenRows: true, above: true };
  }
  return { y: highest, betweenRows: false, above: false };
}

export const legNameBaseline = (part: PlacedPart, legY: number, layout: Layout, theme: RenderTheme): number =>
  legNameLine(part, legY, layout, theme).y;

/** ピンの名前 1 つの置き場。 */
export type LegName = {
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly size: number;
};

/**
 * ピンの名前の置き場。**描く側・配線よけ (`parts.ts`)・名札の逃がし (`captions.ts`) で同じ答え**。
 * 胴の下 (TO-220 はピンのすぐ下) の行間。置き方は `legNameLine`。
 */
export function legNames(part: PlacedPart, layout: Layout, theme: RenderTheme): LegName[] {
  const points = pinPoints(part, layout);
  if (!points) return [];
  const size = legNameSize(part.pins.map((pin) => pin.name), points.map((point) => point.x), theme.metrics.textSize);
  return part.pins.flatMap((pin, index): LegName[] => {
    const point = points[index];
    if (!point) return [];
    return [{ name: pin.name, x: point.x, y: legNameBaseline(part, point.y, layout, theme), size }];
  });
}

/**
 * ピンの名前の字が占める所 (縁取りまで)。ほかの部品の名札がここに来たら逃がす
 * (`captions.ts` の `captionDrops`)。行間に置いた名前の横に、隣の部品の名札が
 * 並ぶと `E D1 1N60` と続けて読めた。
 */
export function legNameBoxes(part: PlacedPart, layout: Layout, theme: RenderTheme, margin: number): Rect[] {
  // `margin` は横に空ける字数 (`captions.ts` の `captionDrops` が決める)。**縦は縁取りだけ** —
  // 名前も名札も穴の行と行の間に置くので、隣の行間の名札とは穴の行 1 つで離れている。
  // 縦にも字数ぶん広げていたので、胴の上の行間に置いた名前 (i 行の TO-92) が 1 行上の
  // 名札 (`R1 1k`) を押し下げ、名札が TO-92 の胴に乗った。
  const halo = haloWidth(theme) / 2;
  const edge = halo + charWidth(theme) * margin;
  return legNames(part, layout, theme)
    .map((name) => {
      const cap = name.size * NAME_CAP;
      const half = (boldWidth(name.name) * name.size) / 2 + edge;
      return { x: name.x - half, y: name.y - cap - halo, width: half * 2, height: cap + halo * 2 };
    });
}

export type ThreeLeadCaption = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  /** 穴の行と行の間に置いた (字の下の穴を伏せなくてよい)。 */
  readonly betweenRows?: boolean;
  /** ピンの名前が胴の上にある。名札を積むときは上へ積む (下へ積むと胴に掛かる)。 */
  readonly above?: boolean;
};

/**
 * 3 ピンの名札の置き場の候補 (試す順)。**描く側と配線よけ (`captions.ts`) で同じ答え**を使う。
 *
 * ピンが横 1 列なら、まず**ピンの名前と同じ行間の横** (右、次に左) に 1 行で置く。名前の
 * 1 行下に積んでいたので、ピンの列の穴 (h 行のピンなら i と j) が字の下に消え、E のピンの列を
 * 下のレールへ降ろす線 (`j13 -- -b13`) が名札の下から出ていた。2 ピンの名札が胴の下の
 * 1 行だけを使うのと揃う。横が基板の端で切れるか、ほかの部品に掛かる (`captions.ts` の
 * `captionDrops` が決める) なら、従来どおり名前の 1 行下。縦に並んだピンは 1 行下だけ。
 * 名前を胴の上に置いた (`legNameLine` の `above`) ときは、下ではなく 1 行上。
 *
 * TO-220 は胴が上へ伸びるので、名前も名札もピンの下の行間に出る (胴の外)。
 */
export function threeLeadCaptionSpots(
  part: PlacedPart,
  layout: Layout,
  theme: RenderTheme,
  width: number,
): readonly ThreeLeadCaption[] {
  const points = pinPoints(part, layout);
  const centre = points?.[1] ?? points?.[0];
  if (!points || !centre) return [];

  const { y: names, betweenRows, above } = legNameLine(part, centre.y, layout, theme);
  const stacked = { x: centre.x, y: names + (above ? -1 : 1) * theme.metrics.textSize * NAME_LINE, width, above };
  if (!inOneRow(points)) return [stacked];

  const nameSize = legNameSize(part.pins.map((pin) => pin.name), points.map((point) => point.x), theme.metrics.textSize);
  const halves = part.pins.map((pin, index) => ({
    x: points[index]?.x ?? centre.x,
    half: (boldWidth(pin.name) * nameSize) / 2,
  }));
  // ピンの名前と名札の間は 2 字ぶん (1 字だと `E Q1` が 1 つの並びに読めた)。
  const gap = charWidth(theme) * 2;
  const right = Math.max(...halves.map(({ x, half }) => x + half)) + gap;
  const left = Math.min(...halves.map(({ x, half }) => x - half)) - gap;
  const first = layout.colX(1) - layout.pitch / 2;
  const last = layout.colX(layout.columns) + layout.pitch / 2;
  return [
    ...(right + width <= last ? [{ x: right + width / 2, y: names, width, betweenRows, above }] : []),
    ...(left - width >= first ? [{ x: left - width / 2, y: names, width, betweenRows, above }] : []),
    stacked,
  ];
}

/**
 * `slot` 番目の置き場。候補を使い切ったら、最後 (名前の 1 行下) からさらに 1 行ずつ下げる
 * (ほかの部品の名札と同じ逃がし方)。名前が胴の上なら 1 行ずつ上げる。
 */
export function threeLeadCaptionAt(
  part: PlacedPart,
  layout: Layout,
  theme: RenderTheme,
  width: number,
  slot = 0,
): ThreeLeadCaption | null {
  const spots = threeLeadCaptionSpots(part, layout, theme, width);
  const last = spots[spots.length - 1];
  if (!last) return null;
  if (slot < spots.length) return spots[slot] ?? last;
  const step = (last.above === true ? -1 : 1) * theme.metrics.textSize * NAME_LINE;
  return { ...last, y: last.y + (slot - spots.length + 1) * step };
}

export function renderThreeLead(part: PlacedPart, layout: Layout, theme: RenderTheme, slot = 0): string {
  const points = pinPoints(part, layout);
  const center = points?.[1];
  if (!points || !center) return '';

  const { palette } = theme;
  const reach = bodyHalfHeight(part, layout);
  const towardRavine = center.y < layout.ravineY ? 1 : -1;

  // **胴から離れたピンは線で胴へつなぐ** (`j14 j18 j22` のように広げて挿したとき)。
  // ピンの四角だけでは、どの穴が胴のピンか読めなかった。隣の穴 (1 ピッチ) のピンは今までどおり四角だけ。
  const halfWidth = bodyHalfWidth(part, layout);
  const leads = points
    .filter((point) => Math.hypot(point.x - center.x, point.y - center.y) > layout.pitch * 1.5)
    .map((point) => {
      const dx = point.x - center.x;
      const dy = point.y - center.y;
      const length = Math.hypot(dx, dy);
      return element('line', {
        x1: num(center.x + (dx / length) * halfWidth), y1: num(center.y + (dy / length) * halfWidth),
        x2: num(point.x), y2: num(point.y),
        stroke: palette.lead, 'stroke-width': num(theme.metrics.wireWidth), 'stroke-linecap': 'round',
      });
    })
    .join('');
  // ピン先は配線の端・2 ピンの端と同じ金属の粒にする (挿した所の見え方を揃える)。
  const legs = points.map((point) => insertionDot(point, theme)).join('');
  // **ピンの名前もキャプションも胴の下へ。** 図の中で名前の出る側が揃う
  // (実機で「すべての部品名は部品の下側に表示する」)。溝の側へ振り分けて
  // いたが、上下のブロックで側が変わって揃わなかった。
  const names = legNames(part, layout, theme)
    .map((name) => svgText(name.x, name.y, name.name, {
      'font-size': num(name.size),
      'font-weight': 700,
      fill: palette.partText,
      halo: palette.textHalo,
      haloWidth: haloWidth(theme),
      haloOpacity: BOARD_HALO_OPACITY, inkOpacity: BOARD_INK_OPACITY,
    }))
    .join('');
  // キャプションはピンの名前の横 (入らなければ名前の 1 行下)。置き場は `threeLeadCaptionAt`。
  const at = threeLeadCaptionAt(part, layout, theme, captionTextWidth(part, theme), slot)
    ?? { x: center.x, y: legNameBaseline(part, center.y, layout, theme) };
  const text = fitToBoard(caption(part), at.x, theme.metrics.textSize, layout);
  const label = partLabel(at.x, at.y, text, theme);

  const shell = drawPackage(part, {
    cx: center.x,
    cy: center.y,
    reach,
    halfWidth: bodyHalfWidth(part, layout),
    // **キャプションを置く側** = 溝の側 (TO-92 の平らな面は反対)。TO-220 は側に依らず、タブが上。
    side: towardRavine > 0 ? 1 : -1,
    plate: theme.palette.plate,
    chipBody: theme.palette.chipBody,
    chipText: theme.palette.chipText,
  });
  return `${leads}${shell}${legs}${names}${label}`;
}

