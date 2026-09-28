import type { Layout } from '../model/layout.ts';
import type { PlacedPart } from '../types.ts';
import {
  LEG_NAME_CLEAR, NAME_CAP, NAME_LINE, caption, captionTextWidth, charWidth, fitToBoard, haloWidth, partLabel, pinPoints,
} from './partCommon.ts';
import { HOLE_ROWS, RAIL_ROWS } from '../types.ts';
import type { Point, Rect } from '../types.ts';
import { drawPackage, packageHalfWidth, packageReach } from 'fence-kit';
import { BOARD_HALO_OPACITY, element, num, svgText } from './svg.ts';
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

/** 足の名前に使ってよい、隣の足までの間隔の割合 (残りは名前どうしの隙間)。 */
const LEG_NAME_ROOM = 0.9;

/**
 * 太字の字の幅 (字の大きさを 1 とする)。足の名前は太字で、大文字が多い —
 * `textWidth` の平均 (0.55) で見積もると `VCC` `GND` `OUT` が重なった (図で確かめた)。
 */
const BOLD_LOWER = 0.58;
const BOLD_UPPER = 0.72;
const WIDE = 1;

const boldWidth = (text: string): number =>
  [...text].reduce((sum, char) => sum + (/[a-z]/.test(char) ? BOLD_LOWER : /[ -~]/.test(char) ? BOLD_UPPER : WIDE), 0);

/**
 * 足の名前の字の大きさ。**隣の足の名前とぶつかるときだけ縮める** — 3 本足の IC
 * (`ic3`) は `Vout` `GND` のような名前を隣り合う穴に書くので、既定の大きさでは
 * 重なる。1 文字の名前 (`B` `C` `E`) は収まるので既定のまま。縦に並んだ足は
 * 名前が横にずれないので縮めない。
 */
function legNameSize(names: readonly string[], xs: readonly number[], size: number): number {
  // **並べ替えてから差を取る** — 足は書いた順に並ぶとは限らない (`h9 h12 h10`)。
  const sorted = [...xs].sort((a, b) => a - b);
  const gaps = sorted.slice(1).map((x, index) => x - (sorted[index] ?? x)).filter((gap) => gap > 0);
  if (gaps.length === 0) return size;
  const widest = Math.max(0, ...names.map(boldWidth));
  const room = Math.min(...gaps) * LEG_NAME_ROOM;
  return widest * size <= room ? size : room / widest;
}

/** 足が横 1 列に並んでいるか (縦に並んだ足は名前が横にずれないので、名札は従来どおり下)。 */
const inOneRow = (points: readonly Point[]): boolean =>
  points.every((point) => Math.abs(point.y - (points[0]?.y ?? point.y)) < 0.5);

/** 板の穴の行の高さ (上から)。無いレールは数えない。 */
const holeRowYs = (layout: Layout): number[] =>
  [...new Set([...RAIL_ROWS, ...HOLE_ROWS].map((row) => layout.rowY(row)).filter((y) => y > 0))].sort((a, b) => a - b);

/**
 * 足の名前の基準線。**穴の行と行の間**に字を収める — 胴の下の縁より下で最初の
 * 行間 (溝も行間) の真ん中に字の中心を置く。穴の行に掛けて書いていたので、足の
 * すぐ下の行 (h 行の足なら i 行) の穴が名前の字と縁取りの下に消えた。
 * 収まる行間が無ければ (板のいちばん下の行の足) 胴のすぐ下 (`betweenRows` は偽)。
 */
export function legNameLine(
  part: PlacedPart,
  legY: number,
  layout: Layout,
  theme: RenderTheme,
): { readonly y: number; readonly betweenRows: boolean } {
  const cap = theme.metrics.textSize * NAME_CAP;
  const edge = haloWidth(theme) / 2;
  const hole = theme.metrics.holeSize / 2;
  // 胴の下の縁から離す最小 (今までと同じ)。これより上へは寄せない。
  const highest = legY + bodyHalfHeight(part, layout) + LEG_NAME_CLEAR + cap;
  const rows = [legY, ...holeRowYs(layout).filter((y) => y > legY + 0.5)];
  for (let index = 1; index < rows.length; index += 1) {
    const [above, below] = [rows[index - 1] ?? 0, rows[index] ?? 0];
    // 行間の真ん中に字の中心。胴に近すぎるなら胴の側だけ下げる。
    const y = Math.max((above + below) / 2 + cap / 2, highest);
    if (y + edge <= below - hole && y - cap - edge >= above + hole) return { y, betweenRows: true };
  }
  return { y: highest, betweenRows: false };
}

export const legNameBaseline = (part: PlacedPart, legY: number, layout: Layout, theme: RenderTheme): number =>
  legNameLine(part, legY, layout, theme).y;

/**
 * 足の名前の字が占める所 (縁取りまで)。ほかの部品の名札がここに来たら逃がす
 * (`captions.ts` の `captionDrops`)。行間に置いた名前の横に、隣の部品の名札が
 * 並ぶと `E D1 1N60` と続けて読めた。
 */
export function legNameBoxes(part: PlacedPart, layout: Layout, theme: RenderTheme, margin: number): Rect[] {
  const points = pinPoints(part, layout);
  if (!points) return [];
  const size = legNameSize(part.pins.map((pin) => pin.name), points.map((point) => point.x), theme.metrics.textSize);
  const cap = theme.metrics.textSize * NAME_CAP;
  // `margin` は空ける字数 (`captions.ts` の `captionDrops` が決める)。
  const edge = haloWidth(theme) / 2 + charWidth(theme) * margin;
  return part.pins.flatMap((pin, index) => {
    const point = points[index];
    if (!point) return [];
    const baseline = legNameBaseline(part, point.y, layout, theme);
    const half = (boldWidth(pin.name) * size) / 2 + edge;
    return [{ x: point.x - half, y: baseline - cap - edge, width: half * 2, height: cap + edge * 2 }];
  });
}

export type ThreeLeadCaption = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  /** 穴の行と行の間に置いた (字の下の穴を伏せなくてよい)。 */
  readonly betweenRows?: boolean;
};

/**
 * 3 本足の名札の置き場の候補 (試す順)。**描く側と配線よけ (`captions.ts`) で同じ答え**を使う。
 *
 * 足が横 1 列なら、まず**足の名前と同じ行間の横** (右、次に左) に 1 行で置く。名前の
 * 1 行下に積んでいたので、足の列の穴 (h 行の足なら i と j) が字の下に消え、E の足の列を
 * 下のレールへ降ろす線 (`j13 -- -b13`) が名札の下から出ていた。2 本足の名札が胴の下の
 * 1 行だけを使うのと揃う。横が板の端で切れるか、ほかの部品に掛かる (`captions.ts` の
 * `captionDrops` が決める) なら、従来どおり名前の 1 行下。縦に並んだ足は 1 行下だけ。
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

  const { y: names, betweenRows } = legNameLine(part, centre.y, layout, theme);
  const below = { x: centre.x, y: names + theme.metrics.textSize * NAME_LINE, width };
  if (!inOneRow(points)) return [below];

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
    ...(right + width <= last ? [{ x: right + width / 2, y: names, width, betweenRows }] : []),
    ...(left - width >= first ? [{ x: left - width / 2, y: names, width, betweenRows }] : []),
    below,
  ];
}

/**
 * `slot` 番目の置き場。候補を使い切ったら、最後 (名前の 1 行下) からさらに 1 行ずつ下げる
 * (ほかの部品の名札と同じ逃がし方)。
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
  return { ...last, y: last.y + (slot - spots.length + 1) * theme.metrics.textSize * NAME_LINE };
}

export function renderThreeLead(part: PlacedPart, layout: Layout, theme: RenderTheme, slot = 0): string {
  const points = pinPoints(part, layout);
  const center = points?.[1];
  if (!points || !center) return '';

  const { palette, metrics } = theme;
  const reach = bodyHalfHeight(part, layout);
  const towardRavine = center.y < layout.ravineY ? 1 : -1;

  const legs = points
    .map((point) =>
      element('rect', { x: num(point.x - 3), y: num(point.y - 3), width: 6, height: 6, fill: palette.chipPin }),
    )
    .join('');
  // **足の名前もキャプションも胴の下へ。** 図の中で名前の出る側が揃う
  // (実機で「すべての部品名は部品の下側に表示する」)。溝の側へ振り分けて
  // いたが、上下のブロックで側が変わって揃わなかった。
  const nameY = (y: number): number => legNameBaseline(part, y, layout, theme);
  const nameSize = legNameSize(part.pins.map((pin) => pin.name), points.map((point) => point.x), metrics.textSize);
  const names = part.pins
    .map((pin, index) => {
      const point = points[index];
      return point
        ? svgText(point.x, nameY(point.y), pin.name, {
            'font-size': num(nameSize),
            'font-weight': 700,
            fill: palette.partText,
            halo: palette.textHalo,
            haloWidth: haloWidth(theme),
            haloOpacity: BOARD_HALO_OPACITY,
          })
        : '';
    })
    .join('');
  // キャプションは足の名前の横 (入らなければ名前の 1 行下)。置き場は `threeLeadCaptionAt`。
  const at = threeLeadCaptionAt(part, layout, theme, captionTextWidth(part, theme), slot) ?? { x: center.x, y: nameY(center.y) };
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
  return `${shell}${legs}${names}${label}`;
}

