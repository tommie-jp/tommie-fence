import { REAL_INK, partPlateColor, plateInk } from 'fence-kit';
import type { BodyInk } from 'fence-kit';
import type { PlacedPart } from '../types.ts';

/**
 * 部品の基板の色 (部品の行の末尾に書いた色)。書いていなければ null (実物の色で描く)。
 * 読み方と描き方は perfboard と同じ (`fence-kit` の plateColor.ts)。
 */
export const plateOf = (part: PlacedPart): string | null => (part.color == null ? null : partPlateColor(part.color));

/** 基板のある部品の塗り。**色を書いた部品だけ**、変換基板の塗りを書いた色に替える。書いていなければ null。 */
export const plateInkOf = (part: PlacedPart): BodyInk | null => {
  const plate = plateOf(part);
  return plate === null ? null : plateInk(REAL_INK, plate);
};
