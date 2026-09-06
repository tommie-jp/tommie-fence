import { boardBox, boardChip, lookupBoardPart } from 'fence-kit';
import type { Layout } from '../model/layout.ts';
import type { PlacedPart, Rect } from '../types.ts';
import {
  CAPTION_CLEAR, NAME_CAP, caption, fitToBoard, partLabel, pinPoints,
} from './partCommon.ts';
import { chipInk } from './packages.ts';
import type { RenderTheme } from './theme.ts';
import { textScale } from './theme.ts';

export function boardBodyRect(part: PlacedPart, layout: Layout): Rect {
  const points = pinPoints(part, layout);
  if (!points || points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  return boardBox(points, layout.pitch);
}

/**
 * 溝をまたいで挿すマイコンボード。**姿は fence-kit にある**
 * (`parts/chips.ts`) — 実物の基板の話で板に依らないので、perfboard と
 * 同じ絵になる (実機で「pico など、全ての部品の見た目を breadboard と
 * perfboard で共通にする」)。ここに残るのは板の話 — 足の点と、
 * 板からはみ出す字の切り方。
 */
export function renderBoardPart(part: PlacedPart, layout: Layout, theme: RenderTheme, drop = 0): string {
  const points = pinPoints(part, layout);
  if (!points || points.length === 0) return '';

  // **`pins[0]` は 1 番ピンとは限らない** — 升の並びは固定で、回すと名前のほうが
  // 巡る (`placement/place.ts` の spun)。だから名前で引く。
  const definition = lookupBoardPart(part.type);
  const pinOne = part.pins.findIndex((pin) => pin.name === definition?.pins[0]);
  const drawn = boardChip({
    points,
    names: part.pins.map((pin) => pin.name),
    definition,
    pinOne: pinOne < 0 ? 0 : pinOne,
    pitch: layout.pitch,
    scale: textScale(theme),
    ink: chipInk(theme),
  });

  // **名前は胴の下。** 基板の中に置いていたころは、長い足の名前
  // (`ADC_VREF 35`) と食い合っていた (実機で「文字が図形に被らないようにする」)。
  // ほかの部品と側も揃う (実機で「すべての部品名は部品の下側に表示する」)。
  const body = boardBodyRect(part, layout);
  const centreX = body.x + body.width / 2;
  const label = partLabel(
    centreX,
    body.y + body.height + CAPTION_CLEAR + theme.metrics.textSize * NAME_CAP + drop,
    fitToBoard(caption(part), centreX, theme.metrics.textSize, layout),
    theme,
  );
  return `${drawn}${label}`;
}
