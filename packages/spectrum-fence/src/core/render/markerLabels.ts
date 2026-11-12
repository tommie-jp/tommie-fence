import { BOLD_FAMILY, num, placeLabels, svgText, textWidth } from 'fence-kit';
import type { Pixel } from 'fence-kit';
import { xOf, yOf } from '../layout/scales.ts';
import type { Axes } from '../layout/scales.ts';
import type { Rect } from '../layout/screen.ts';
import type { Point } from '../model/trace.ts';
import type { Theme } from './theme.ts';
import { decimate, markerGlyphBox } from './trace.ts';

/** 画面に出たマーカー 1 つ。`number` は M の番号 (1 始まり)、`label` は書き手の名札 (無ければ undefined)。 */
export type ShownMarker = {
  readonly point: Point; readonly number: number; readonly label: string | undefined; readonly line: number | null;
};

/**
 * マーカーの名札。**計器の画面には無い書き手の注釈**なので、マーカーの色 (トレースの色) ではなく注釈の色で刷る。
 * 置き場は fence-kit の `placeLabels` (graph の点の名札と同じ) — 格子の内に収め、トレースの線・
 * 全部のマーカーの ▽ と番号・ほかの名札に掛けない。空きが無ければ重ねて描き、`clashed` で返す
 * (名札は図にしか無いので省かない)。
 */
export function renderMarkerLabels(
  markers: readonly ShownMarker[], traces: readonly (readonly Point[])[], axes: Axes, grid: Rect, theme: Theme,
): { readonly svg: string; readonly clashed: readonly ShownMarker[] } {
  const labelled = markers.filter((marker) => marker.label !== undefined);
  if (labelled.length === 0) return { svg: '', clashed: [] };
  const size = theme.metrics.smallSize;
  const pixelOf = (point: Point): Pixel => ({ x: xOf(point.at, axes, grid), y: yOf(point.level, axes, grid) });
  const avoid = traces.filter((trace) => trace.length > 1)
    .map((trace) => decimate(trace, axes, grid).map(([x, y]) => ({ x, y })));
  const glyphs = markers.map((marker) => markerGlyphBox(marker.point, axes, grid, theme));
  const placed = placeLabels(
    labelled.map((marker) => ({ ...pixelOf(marker.point), width: textWidth(marker.label ?? '') * size + 2, height: size + 2 })),
    grid, avoid, glyphs,
  );
  const svg = labelled.map((marker, index) => {
    const box = placed[index]?.box;
    if (box === undefined) return '';
    return svgText(box.x + 1, box.y + size, marker.label ?? '', {
      anchor: 'start', fill: theme.palette.note, 'font-size': num(size), 'font-weight': 600, 'font-family': BOLD_FAMILY,
      halo: theme.palette.halo, haloWidth: 2.5, 'data-marker-label': `${marker.number}`,
    });
  }).join('');
  return { svg, clashed: labelled.filter((_, index) => placed[index]?.clash === true) };
}
