import type { Layout } from '../model/layout.ts';
import type { PlacedPart, Point, Rect } from '../types.ts';
import {
  CAPTION_CLEAR, NAME_CAP, caption, fitToBoard, haloWidth, partLabel, pinPoints, pointOfPin,
} from './partCommon.ts';
import { element, num } from './svg.ts';
import { REAL_INK, dipChip, sipBox, sipHeader, transformerCore } from 'fence-kit';
import type { ChipInk } from 'fence-kit';
import type { RenderTheme } from './theme.ts';
import { textScale } from './theme.ts';

/** fence-kit のパッケージに渡す色。**板ではなく部品の色**を集めたもの。 */
export function chipInk(theme: RenderTheme): ChipInk {
  return {
    body: theme.palette.chipBody,
    pin: theme.palette.chipPin,
    chipText: theme.palette.chipText,
    plate: theme.palette.plate,
    outside: theme.palette.partText,
    halo: theme.palette.textHalo,
    haloWidth: haloWidth(theme),
  };
}

/** ピンの上に置く足の跡。 */
const stub = (point: Point, fill: string, dy = -3): string =>
  element('rect', { x: num(point.x - 3), y: num(point.y + dy), width: 6, height: 6, fill });

/**
 * DIP パッケージ。**姿は fence-kit にある** (`parts/chips.ts`) — 実物の
 * パッケージの話で板に依らないので、perfboard と同じ絵になる
 * (実機で「全ての部品の見た目を breadboard と perfboard で共通にする」)。
 * ここに残るのは板の話 — 足の点と、切り欠きを向ける先。
 */
export function renderDip(part: PlacedPart, layout: Layout, theme: RenderTheme): string {
  const points = pinPoints(part, layout);
  if (!points || points.length === 0) return '';

  // **`pins[0]` は 1 番ピンとは限らない** — 升の並びは固定で、回すと名前のほうが
  // 巡る (`placement/place.ts` の spun)。だから名前で引く。
  const pinOne = part.pins.findIndex((pin) => pin.name === '1');
  return dipChip({
    points,
    names: part.pins.map((pin) => pin.name),
    pinOne: pinOne < 0 ? 0 : pinOne,
    pitch: layout.pitch,
    caption: caption(part),
    scale: textScale(theme),
    ink: chipInk(theme),
  });
}

export function sipBarRect(part: PlacedPart, layout: Layout): Rect {
  const points = pinPoints(part, layout);
  if (!points || points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  return sipBox(points, layout.pitch);
}

/**
 * 1 列に並んだヘッダ。**姿は fence-kit にある** (`parts/chips.ts`)。
 * 板の話として残るのは**ピン名をどちら側に出すか**だけ — 出す先は溝の側:
 * 盤の端には列番号が印字されていて、そこに重ねると両方読めなくなる。
 */
export function renderSip(part: PlacedPart, layout: Layout, theme: RenderTheme): string {
  const points = pinPoints(part, layout);
  const first = points?.[0];
  if (!points || !first) return '';

  return sipHeader({
    points,
    names: part.pins.map((pin) => pin.name),
    pitch: layout.pitch,
    caption: caption(part),
    scale: textScale(theme),
    nameSide: first.y < layout.ravineY ? 1 : -1,
    ink: chipInk(theme),
  });
}

/** タクトスイッチの本体が覆う範囲 (ピッチに対する比)。6mm 角なので 2 列 + 溝ぶん。 */
const SWITCH_PAD_X = 0.45;
const SWITCH_PAD_Y = 0.4;

export function switchBodyRect(part: PlacedPart, layout: Layout): Rect {
  const points = pinPoints(part, layout);
  if (!points || points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const x0 = Math.min(...xs) - SWITCH_PAD_X * layout.pitch;
  const x1 = Math.max(...xs) + SWITCH_PAD_X * layout.pitch;
  const y0 = Math.min(...ys) - SWITCH_PAD_Y * layout.pitch;
  const y1 = Math.max(...ys) + SWITCH_PAD_Y * layout.pitch;
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/**
 * 溝をまたぐ 4 本足のタクトスイッチ。**押していなくてもつながっている足の組を線で描く**。
 * 実物では見えない結線だが、ここを知らずに同じ側の 2 本を使うと回路が最初から短絡する
 * (この図がいちばん防ぎたい間違い)。
 */
export function renderPushbutton(part: PlacedPart, layout: Layout, theme: RenderTheme, drop = 0): string {
  const points = pinPoints(part, layout);
  if (!points || points.length === 0) return '';

  const { palette } = theme;
  const body = switchBodyRect(part, layout);
  const center = { x: body.x + body.width / 2, y: body.y + body.height / 2 };

  const shell = element('rect', {
    x: num(body.x), y: num(body.y), width: num(body.width), height: num(body.height), rx: 3,
    fill: palette.chipBody, stroke: '#14171c',
  });
  const bridges = part.bridges
    .map(([from, to]) => {
      const a = pointOfPin(part, from, layout);
      const b = pointOfPin(part, to, layout);
      return a && b
        ? element('line', {
            x1: num(a.x), y1: num(a.y), x2: num(b.x), y2: num(b.y),
            stroke: palette.chipPin, 'stroke-width': 2.4, 'stroke-opacity': 0.55,
          })
        : '';
    })
    .join('');
  const stubs = points.map((point) => stub(point, palette.chipPin)).join('');
  const button = element('circle', {
    cx: num(center.x), cy: num(center.y), r: num(0.45 * layout.pitch),
    fill: '#c9cfd8', stroke: '#6b7280',
  });
  // **名前は胴の下。** 上に出していたが、ほかの部品と側が揃わなかった
  // (実機で「transformer, button* は名前を部品の下にする」)。
  const label = partLabel(
    center.x,
    body.y + body.height + CAPTION_CLEAR + theme.metrics.textSize * NAME_CAP + drop,
    fitToBoard(caption(part), center.x, theme.metrics.textSize, layout),
    theme,
  );

  return `${shell}${bridges}${stubs}${button}${label}`;
}

/**
 * 変圧器。**書かれた 4 つの穴を囲む箱**として描き、中身 (積層鉄心と巻線) は
 * fence-kit が描く — 実物の話で板に依らないので、perfboard と同じ絵になる。
 *
 * 足の並びを決め打たないのは、実物の足の並びが品によって違うため。
 * どの穴に挿したかをそのまま図にする (2 本足・3 本足と同じ考え方)。
 */
export function renderTransformer(part: PlacedPart, layout: Layout, theme: RenderTheme, drop = 0): string {
  const rect = fourLeadBodyRect(part, layout);
  if (rect.width === 0) return '';

  const centre = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  const core = element(
    'g',
    { transform: `translate(${num(centre.x)} ${num(centre.y)})` },
    transformerCore(rect.width, rect.height, REAL_INK),
  );
  const stubs = (pinPoints(part, layout) ?? []).map((point) => stub(point, theme.palette.chipPin)).join('');
  // **字は胴の下。** ほかの部品と側を揃える (実機で「名前を部品の下にする」)。
  const label = partLabel(
    centre.x,
    centre.y + rect.height / 2 + CAPTION_CLEAR + theme.metrics.textSize * NAME_CAP + drop,
    fitToBoard(caption(part), centre.x, theme.metrics.textSize, layout),
    theme,
  );
  return `${core}${stubs}${label}`;
}

/** 4 本足を囲む箱。**配線をよける領域**と描画で同じ数字を使う。 */
export function fourLeadBodyRect(part: PlacedPart, layout: Layout): Rect {
  const points = pinPoints(part, layout);
  if (!points || points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const x0 = Math.min(...xs) - FOUR_LEAD_PAD;
  const x1 = Math.max(...xs) + FOUR_LEAD_PAD;
  const y0 = Math.min(...ys) - FOUR_LEAD_PAD;
  const y1 = Math.max(...ys) + FOUR_LEAD_PAD;
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/** 足の穴から胴の縁までの余白。実物も足の外側に樹脂が回る。 */
const FOUR_LEAD_PAD = 6;
