import type { Layout } from '../model/layout.ts';
import type { PlacedPart } from '../types.ts';
import { LEG_NAME_CLEAR, NAME_CAP, NAME_LINE, caption, fitToBoard, haloWidth, partLabel, pinPoints } from './partCommon.ts';
import { drawPackage, packageHalfWidth, packageReach } from 'fence-kit';
import { element, num, svgText } from './svg.ts';
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

export function renderThreeLead(part: PlacedPart, layout: Layout, theme: RenderTheme, drop = 0): string {
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
  const cap = metrics.textSize * NAME_CAP;
  const nameY = (y: number): number => y + reach + LEG_NAME_CLEAR + cap;
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
          })
        : '';
    })
    .join('');
  const text = fitToBoard(caption(part), center.x, theme.metrics.textSize, layout);
  // キャプションは名前の 1 行下 (名前と同じ側に積む)。
  const label = partLabel(center.x, nameY(center.y) + metrics.textSize * NAME_LINE + drop, text, theme);

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

