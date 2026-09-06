import { boardBox, boardChip, lookupBoardPart } from 'fence-kit';
import type { Layout } from '../model/layout.ts';
import type { PlacedPart, Rect } from '../types.ts';
import { caption, fitToBoard, pinPoints } from './partCommon.ts';
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
export function renderBoardPart(part: PlacedPart, layout: Layout, theme: RenderTheme): string {
  const points = pinPoints(part, layout);
  if (!points || points.length === 0) return '';

  // **`pins[0]` は 1 番ピンとは限らない** — 升の並びは固定で、回すと名前のほうが
  // 巡る (`placement/place.ts` の spun)。だから名前で引く。
  const definition = lookupBoardPart(part.type);
  const pinOne = part.pins.findIndex((pin) => pin.name === definition?.pins[0]);
  return boardChip({
    points,
    names: part.pins.map((pin) => pin.name),
    definition,
    pinOne: pinOne < 0 ? 0 : pinOne,
    pitch: layout.pitch,
    caption: caption(part),
    scale: textScale(theme),
    ink: chipInk(theme),
    // 基板の左に右揃えで置くので、伸びるのは左だけ。画布の左端で切る。
    fit: (text, at, fontSize) => fitToBoard(text, at.x, fontSize, layout, 'end'),
  });
}
