import { formatHertz } from 'fence-kit';
import type { Lang } from 'fence-kit';
import { labelsOf } from '../render/labels.ts';
import type { LevelUnit } from './device.ts';
import { formatLevel } from './level.ts';
import type { Point } from './trace.ts';

/**
 * マーカー。**周波数** (`100M`) は一番近い点に吸い付き (実機と同じ)、**`peak`** は一番高い点。
 * 理想でも実測でも同じ算法 (点の列から)。`delta` `noise` は段 3。
 * `label` は書き手の名札 (`- 7.26M: 字`)。計器の画面には無い物で、図には注釈の色で刷る。
 */
export type MarkerSpec =
  | { readonly kind: 'f'; readonly f: number; readonly line: number | null; readonly label?: string }
  | { readonly kind: 'peak'; readonly line: number | null; readonly label?: string };

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
  /**
   * 1 行目は見出し (`M 周波数 レベル`)、続いて M1〜M4。マーカーが無ければ空。
   * 名札のあるマーカーが 1 つでもあれば、終わりに名札の欄 (名札の無いマーカーは空の字)。
   */
  readonly rows: readonly (readonly string[])[];
  /** 値の出どころ。null は読む点が無い。 */
  readonly basis: 'model' | 'data' | 'hold' | null;
};

const DASH = '—';

/** 読み値の表。**書式は実機のマーカーと同じ** (`100.000 MHz` `−7.90 dBm`)。 */
export function readMarkers(
  markers: readonly MarkerSpec[],
  points: readonly Point[],
  unit: LevelUnit,
  basis: Readings['basis'],
  lang: Lang = 'ja',
): Readings {
  if (markers.length === 0) return { rows: [], basis };
  // 名札の欄は**名札があるときだけ** (名札の無い図は今までと 1 字も変わらない)。
  const labelled = markers.some((marker) => marker.label !== undefined);
  const tail = (marker: MarkerSpec): readonly string[] => (labelled ? [marker.label ?? ''] : []);
  const rows = markers.map((marker, index) => {
    const point = markerPoint(marker, points);
    return point === null
      ? [`${index + 1}`, DASH, DASH, ...tail(marker)]
      : [`${index + 1}`, formatHertz(point.at), formatLevel(point.level, unit), ...tail(marker)];
  });
  const t = labelsOf(lang);
  return { rows: [['M', t.frequency, t.level, ...(labelled ? [t.label] : [])], ...rows], basis };
}
