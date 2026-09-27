import { formatHertz } from 'fence-kit';
import type { LevelUnit } from './device.ts';
import { formatLevel } from './level.ts';
import type { Point } from './trace.ts';

/**
 * マーカー。**周波数** (`100M`) は一番近い点に吸い付き (実機と同じ)、**`peak`** は一番高い点。
 * 理想でも実測でも同じ算法 (点の列から)。`delta` `noise` は段 3。
 */
export type MarkerSpec =
  | { readonly kind: 'f'; readonly f: number; readonly line: number | null }
  | { readonly kind: 'peak'; readonly line: number | null };

/** 一番近い点。空なら null。 */
export function nearestPoint(points: readonly Point[], f: number): Point | null {
  let best: Point | null = null;
  for (const point of points) {
    if (best === null || Math.abs(point.f - f) < Math.abs(best.f - f)) best = point;
  }
  return best;
}

/** 一番高い点 (同じ高さなら周波数の低い方)。空なら null。 */
export function peakPoint(points: readonly Point[]): Point | null {
  let best: Point | null = null;
  for (const point of points) {
    if (best === null || point.level > best.level) best = point;
  }
  return best;
}

/** マーカーが指す点。 */
export const markerPoint = (marker: MarkerSpec, points: readonly Point[]): Point | null =>
  (marker.kind === 'peak' ? peakPoint(points) : nearestPoint(points, marker.f));

export type Readings = {
  /** 1 行目は見出し (`M 周波数 レベル`)、続いて M1〜M4。マーカーが無ければ空。 */
  readonly rows: readonly (readonly string[])[];
  /** 値の出どころ。null は読む点が無い。 */
  readonly basis: 'model' | 'data' | null;
};

const DASH = '—';

/** 読み値の表。**書式は実機のマーカーと同じ** (`100.000 MHz` `−7.90 dBm`)。 */
export function readMarkers(
  markers: readonly MarkerSpec[],
  points: readonly Point[],
  unit: LevelUnit,
  basis: 'model' | 'data' | null,
): Readings {
  if (markers.length === 0) return { rows: [], basis };
  const rows = markers.map((marker, index) => {
    const point = markerPoint(marker, points);
    return point === null
      ? [`${index + 1}`, DASH, DASH]
      : [`${index + 1}`, formatHertz(point.at), formatLevel(point.level, unit)];
  });
  return { rows: [['M', '周波数', 'レベル'], ...rows], basis };
}
