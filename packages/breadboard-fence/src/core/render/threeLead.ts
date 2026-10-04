import type { Layout } from '../model/layout.ts';
import type { PlacedPart } from '../types.ts';
import {
  LEG_NAME_CLEAR, NAME_CAP, NAME_LINE, caption, captionTextWidth, charWidth, fitToBoard, haloWidth, partLabel, pinPoints,
} from './partCommon.ts';
import { HOLE_ROWS } from '../types.ts';
import type { HoleRow, Point, Rect } from '../types.ts';
import { drawPackage, packageHalfWidth, packageReach } from 'fence-kit';
import { insertionDot, insertionDotRadius } from './wires.ts';
import { BOARD_HALO_OPACITY, BOARD_INK_OPACITY, element, num, svgText } from './svg.ts';
import type { RenderTheme } from './theme.ts';

/**
 * 3 本足の部品。**足の並びは真ん中の足を中心に描く**。
 *
 * **パッケージの姿は fence-kit にある** (`parts/packages.ts`)。実物の話で板に
 * 依らないので、perfboard と同じ絵になる (52 の docs/18)。ここに残るのは板の
 * 話 — 足の点、ピン名、キャプション、どちら側に寄せるか。
 * パッケージの向き (TO-92 の平らな面、スイッチの倒れている側) は図では主張しない。
 * 品種や状態で変わるものを図に描くと嘘になるので、どの穴がどの足かをピン名で示す。
 */
export const bodyHalfHeight = (part: PlacedPart, layout: Layout): number =>
  packageReach(part, layout.pitch);

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
 * 隣り合う足の名前の間に空ける幅 (字の大きさを 1 とする)。くっつくと `in gndout` と
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
 * 足の名前の字の大きさ。**隣の足の名前とぶつかるときだけ縮める** — 3 本足の IC
 * (`ic3`) や TO-220 は `Vout` `gnd` のような名前を隣り合う穴に書くので、既定の大きさでは
 * 重なる (DIP の足の名前と同じくらいまで縮む)。1 文字の名前 (`B` `C` `E`) は収まるので
 * 既定のまま。縦に並んだ足は名前が横にずれないので縮めない。
 */
function legNameSize(names: readonly string[], xs: readonly number[], size: number): number {
  // **並べ替えてから差を取る** — 足は書いた順に並ぶとは限らない (`h9 h12 h10`)。
  const sorted = [...xs].sort((a, b) => a - b);
  const gaps = sorted.slice(1).map((x, index) => x - (sorted[index] ?? x)).filter((gap) => gap > 0);
  if (gaps.length === 0) return size;
  const widest = Math.max(0, ...names.map(boldWidth)) + LEG_NAME_SPACE;
  const room = Math.min(...gaps);
  return widest * size <= room ? size : room / widest;
}

/** 足が横 1 列に並んでいるか (縦に並んだ足は名前が横にずれないので、名札は従来どおり下)。 */
const inOneRow = (points: readonly Point[]): boolean =>
  points.every((point) => Math.abs(point.y - (points[0]?.y ?? point.y)) < 0.5);

/** 溝の上のブロック (a〜e) と下のブロック (f〜j)。 */
const BLOCKS: readonly (readonly HoleRow[])[] = [HOLE_ROWS.slice(0, 5), HOLE_ROWS.slice(5)];

type RowGap = { readonly above: number; readonly below: number };

/**
 * 足の名前を置いてよい行間。**足と同じブロックの中の、隣り合う 2 行の間だけ** —
 * 外したのは 3 つで、どれも書き手の線がよく通るか、足から遠い:
 *
 * - 端の行 (a・j) とレールの間。列番号の帯で、足の列をレールへ降ろす電源と GND の線が
 *   ここを縦に通る (`j4 -- -b4`。i 行の TO-92 の `E` が列番号と GND の線に重なった)
 * - 溝。足の列を溝の向こうへ渡す線 (`e8 -- f8`) がここを縦に通る
 * - 溝の向こうのブロック。どの部品の足の名前か読めない
 *
 * `ravine` を真にすると溝も入れる (TO-220 の名札。足の列から横へずらして置くので、
 * 列を渡る線とは重ならない)。
 */
function rowGaps(layout: Layout, legY: number, ravine: boolean): RowGap[] {
  const rows = BLOCKS[legY < layout.ravineY ? 0 : 1] ?? [];
  const inBlock = rows.slice(1).map((row, index) => ({ above: layout.rowY(rows[index] ?? row), below: layout.rowY(row) }));
  const ravineGap = { above: layout.rowY('e'), below: layout.rowY('f') };
  return [...inBlock, ...(ravine ? [ravineGap] : [])]
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
 * 足の名前の基準線。**穴の行と行の間**に字を収める — まず胴の下で最初に収まる行間
 * (`rowGaps`)、無ければ胴の上で最初に収まる行間。行間の真ん中に字の中心を置く。
 * 穴の行に掛けて書いていたので、足のすぐ下の行 (h 行の足なら i 行) の穴が名前の字と
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
  ravine = false,
): LegNameLine {
  const cap = theme.metrics.textSize * NAME_CAP;
  const edge = haloWidth(theme) / 2;
  const hole = theme.metrics.holeSize / 2;
  const reach = bodyHalfHeight(part, layout);
  // 胴の下の縁から離す最小 (今までと同じ)。これより上へは寄せない。
  const highest = legY + reach + LEG_NAME_CLEAR + cap;
  // 胴の上の縁から離す最小。基準線がこれより下だと字が胴に掛かる。
  const lowest = legY - reach - LEG_NAME_CLEAR;
  const fits = (y: number, gap: RowGap): boolean => y + edge <= gap.below - hole && y - cap - edge >= gap.above + hole;
  const gaps = rowGaps(layout, legY, ravine);

  for (const gap of gaps.filter((candidate) => candidate.above >= legY - 0.5)) {
    const y = Math.max((gap.above + gap.below) / 2 + cap / 2, highest);
    if (fits(y, gap)) return { y, betweenRows: true, above: false };
  }
  for (const gap of gaps.filter((candidate) => candidate.below <= legY + 0.5).reverse()) {
    const y = Math.min((gap.above + gap.below) / 2 + cap / 2, lowest);
    if (fits(y, gap)) return { y, betweenRows: true, above: true };
  }
  return { y: highest, betweenRows: false, above: false };
}

export const legNameBaseline = (part: PlacedPart, legY: number, layout: Layout, theme: RenderTheme): number =>
  legNameLine(part, legY, layout, theme).y;

/**
 * 足の名前を**胴の樹脂の上に刷る**か。TO-220 だけ — 胴が足の行の上下 1.4 ピッチまで
 * 広がるので、胴の下の行間は胴で塞がり、名前が溝やその先の行間に落ちた (溝を渡る線の上)。
 * 樹脂は広く、線も通らない (DIP の足の番号と同じ置き方)。
 */
const namesOnBody = (part: PlacedPart): boolean => part.variant === 'to220';

/** 足の名前 1 つの置き場。 */
export type LegName = {
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly onBody: boolean;
};

/** 樹脂の上の字を、足の点から離す量 (px)。 */
const ON_BODY_CLEAR = 2;

/**
 * 足の名前の置き場。**描く側・配線よけ (`parts.ts`)・名札の逃がし (`captions.ts`) で同じ答え**。
 * TO-220 は樹脂の側 (タブの反対。溝から遠い側) の足の点のすぐ脇、ほかは `legNameLine`。
 */
export function legNames(part: PlacedPart, layout: Layout, theme: RenderTheme): LegName[] {
  const points = pinPoints(part, layout);
  if (!points) return [];
  const size = legNameSize(part.pins.map((pin) => pin.name), points.map((point) => point.x), theme.metrics.textSize);
  const onBody = namesOnBody(part);
  const dot = insertionDotRadius(theme) + ON_BODY_CLEAR;
  return part.pins.flatMap((pin, index): LegName[] => {
    const point = points[index];
    if (!point) return [];
    if (!onBody) return [{ name: pin.name, x: point.x, y: legNameBaseline(part, point.y, layout, theme), size, onBody }];
    // 樹脂はタブの反対。タブは溝の側 (`renderThreeLead` の `side`)。
    const plasticUp = point.y < layout.ravineY;
    const y = plasticUp ? point.y - dot : point.y + dot + size * NAME_CAP;
    return [{ name: pin.name, x: point.x, y, size, onBody }];
  });
}

/**
 * 足の名前の字が占める所 (縁取りまで)。ほかの部品の名札がここに来たら逃がす
 * (`captions.ts` の `captionDrops`)。行間に置いた名前の横に、隣の部品の名札が
 * 並ぶと `E D1 1N60` と続けて読めた。**樹脂の上の名前は数えない** (胴そのものが場所を取る)。
 */
export function legNameBoxes(part: PlacedPart, layout: Layout, theme: RenderTheme, margin: number): Rect[] {
  // `margin` は横に空ける字数 (`captions.ts` の `captionDrops` が決める)。**縦は縁取りだけ** —
  // 名前も名札も穴の行と行の間に置くので、隣の行間の名札とは穴の行 1 つで離れている。
  // 縦にも字数ぶん広げていたので、胴の上の行間に置いた名前 (i 行の TO-92) が 1 行上の
  // 名札 (`R1 1k`) を押し下げ、名札が TO-92 の胴に乗った。
  const halo = haloWidth(theme) / 2;
  const edge = halo + charWidth(theme) * margin;
  return legNames(part, layout, theme)
    .filter((name) => !name.onBody)
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
  /** 足の名前が胴の上にある。名札を積むときは上へ積む (下へ積むと胴に掛かる)。 */
  readonly above?: boolean;
};

/**
 * 3 本足の名札の置き場の候補 (試す順)。**描く側と配線よけ (`captions.ts`) で同じ答え**を使う。
 *
 * 足が横 1 列なら、まず**足の名前と同じ行間の横** (右、次に左) に 1 行で置く。名前の
 * 1 行下に積んでいたので、足の列の穴 (h 行の足なら i と j) が字の下に消え、E の足の列を
 * 下のレールへ降ろす線 (`j13 -- -b13`) が名札の下から出ていた。2 本足の名札が胴の下の
 * 1 行だけを使うのと揃う。横が板の端で切れるか、ほかの部品に掛かる (`captions.ts` の
 * `captionDrops` が決める) なら、従来どおり名前の 1 行下。縦に並んだ足は 1 行下だけ。
 * 名前を胴の上に置いた (`legNameLine` の `above`) ときは、下ではなく 1 行上。
 *
 * TO-220 は名前を樹脂に刷るので、名札の行は名前とは別に選ぶ。溝も使ってよい
 * (名札は足の列から横へずらして置くので、溝を渡る線とは重ならない)。
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

  const { y: names, betweenRows, above } = legNameLine(part, centre.y, layout, theme, namesOnBody(part));
  const stacked = { x: centre.x, y: names + (above ? -1 : 1) * theme.metrics.textSize * NAME_LINE, width, above };
  if (!inOneRow(points)) return [stacked];

  const nameSize = legNameSize(part.pins.map((pin) => pin.name), points.map((point) => point.x), theme.metrics.textSize);
  const halves = part.pins.map((pin, index) => ({
    x: points[index]?.x ?? centre.x,
    half: (boldWidth(pin.name) * nameSize) / 2,
  }));
  // 足の名前と名札の間は 2 字ぶん (1 字だと `E Q1` が 1 つの並びに読めた)。
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

  // **胴から離れた足は線で胴へつなぐ** (`j14 j18 j22` のように広げて挿したとき)。
  // 足の四角だけでは、どの穴が胴の足か読めなかった。隣の穴 (1 ピッチ) の足は今までどおり四角だけ。
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
  // 足先は配線の端・2 本足の端と同じ金属の粒にする (挿した所の見え方を揃える)。
  const legs = points.map((point) => insertionDot(point, theme)).join('');
  // **足の名前もキャプションも胴の下へ。** 図の中で名前の出る側が揃う
  // (実機で「すべての部品名は部品の下側に表示する」)。溝の側へ振り分けて
  // いたが、上下のブロックで側が変わって揃わなかった。
  // TO-220 は樹脂の上に明るい字で刷る (DIP の足の番号と同じ)。ほかは板の上に縁取りで。
  const names = legNames(part, layout, theme)
    .map((name) => svgText(name.x, name.y, name.name, {
      'font-size': num(name.size),
      'font-weight': 700,
      ...(name.onBody
        ? { fill: palette.chipText }
        : {
            fill: palette.partText,
            halo: palette.textHalo,
            haloWidth: haloWidth(theme),
            haloOpacity: BOARD_HALO_OPACITY, inkOpacity: BOARD_INK_OPACITY,
          }),
    }))
    .join('');
  // キャプションは足の名前の横 (入らなければ名前の 1 行下)。置き場は `threeLeadCaptionAt`。
  const at = threeLeadCaptionAt(part, layout, theme, captionTextWidth(part, theme), slot)
    ?? { x: center.x, y: legNameBaseline(part, center.y, layout, theme) };
  const text = fitToBoard(caption(part), at.x, theme.metrics.textSize, layout);
  const label = partLabel(at.x, at.y, text, theme);

  const shell = drawPackage(part, {
    cx: center.x,
    cy: center.y,
    reach,
    halfWidth: bodyHalfWidth(part, layout),
    // **キャプションとタブを置く側** = 溝の側。ピン名は反対に並ぶ。
    side: towardRavine > 0 ? 1 : -1,
    plate: theme.palette.plate,
    chipBody: theme.palette.chipBody,
  });
  return `${leads}${shell}${legs}${names}${label}`;
}

