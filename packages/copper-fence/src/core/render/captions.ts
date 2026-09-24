import { bodySize, num, svgText } from 'fence-kit';
import { clampText, LIMITS } from '../limits.ts';
import { describeBoard } from '../model/board.ts';
import type { Layout } from '../model/layout.ts';
import {
  coplanar, electricalDegrees, formatHertz, groundedCoplanar, guidedWavelength, microstrip,
} from '../model/microstrip.ts';
import type { LineModel } from '../model/microstrip.ts';
import { formatMm } from '../model/point.ts';
import type { Coupling } from '../geometry/coupling.ts';
import type { Piece, Shape } from '../geometry/shapes.ts';
import { SMA } from '../parts/footprint.ts';
import type { Footprint } from '../parts/footprint.ts';
import type { Board, LineSpec, Mm } from '../types.ts';
import { bodyPart } from './parts.ts';
import type { Candidate, Placer } from './placer.ts';
import type { Theme } from './theme.ts';

/**
 * 図に添える字 — 線路の**幅と Z0** (と、`f:` があれば電気長)、結合線路の**隙間**、
 * 部品の**名札**、板の**説明の 1 行**。本の 3-12 の題「FR4 で 50Ω の幅を計算して
 * 作る」がそのままキャプションになる (52 の docs/73 決め 7)。
 */

/** 線路の模型。**地の在りかで式が変わる** (裏ベタはマイクロストリップ、表が地は CPW)。 */
export function lineModel(width: number, gap: number, board: Board): LineModel | null {
  switch (board.ground) {
    case 'back': return microstrip(width, board.h, board.er);
    case 'both': return groundedCoplanar(width, gap, board.h, board.er);
    case 'front': return coplanar(width, gap, board.h, board.er);
    case 'none': return null;
  }
}

/** 折れ線の長さ (中心線、mm)。 */
export const pathLength = (points: readonly Mm[]): number =>
  points.slice(1).reduce((sum, point, index) => {
    const before = points[index] ?? point;
    return sum + Math.hypot(point.x - before.x, point.y - before.y);
  }, 0);

/** 線路の字 (`L1 3mm 50.6Ω 90°`)。 */
export function lineCaption(spec: LineSpec, board: Board, f: number | null): string {
  const gap = spec.gap ?? board.cut;
  const model = lineModel(spec.width, gap, board);
  const size = board.ground === 'front' || board.ground === 'both'
    ? `${formatMm(spec.width)}mm s${formatMm(gap)}`
    : `${formatMm(spec.width)}mm`;
  if (model === null) return `${spec.id} ${size}`;
  const degrees = f === null ? '' : ` ${Math.round(electricalDegrees(pathLength(spec.points), f, model.epsEff))}°`;
  return `${spec.id} ${size} ${model.z0.toFixed(1)}Ω${degrees}`;
}

/** 目当ての Z0 の幅 (二分法。Z0 は幅について単調に減る)。 */
function widthFor(z0: number, board: Board): number | null {
  if (board.ground === 'none') return null;
  let [lo, hi] = [0.01, 50];
  for (let i = 0; i < 60; i += 1) {
    const mid = (lo + hi) / 2;
    const model = lineModel(mid, board.cut, board);
    if (model === null) return null;
    if (model.z0 > z0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** 板の説明の 1 行。**50Ω の幅と、`f:` の λg/4** を添える — 切る前に要る 2 つの数。 */
export function boardDescription(board: Board, f: number | null): string {
  const width = widthFor(50, board);
  const fifty = width === null ? '' : `   50Ω = ${width.toFixed(2)}mm`;
  const model = width === null ? null : lineModel(width, board.cut, board);
  const quarter = f === null || model === null
    ? ''
    : `   λg/4 @${formatHertz(f)} = ${(guidedWavelength(f, model.epsEff) / 4).toFixed(1)}mm`;
  return `${describeBoard(board)}${fifty}${quarter}`;
}

const text = (at: Candidate, content: string, theme: Theme, size: number, fill = theme.palette.lineText): string =>
  svgText(at.x, at.y, content, {
    anchor: at.anchor,
    fill,
    'font-size': num(size),
    halo: theme.palette.halo,
    haloWidth: 2.4,
  });

/** 胴を置けない所として控える (字が部品に載らないように)。 */
export function blockParts(footprints: readonly Footprint[], layout: Layout, placer: Placer): void {
  for (const { outline } of footprints) {
    const at = layout.toPx({ x: outline.x, y: outline.y });
    placer.block({ x: at.x, y: at.y, width: layout.len(outline.width), height: layout.len(outline.height) });
  }
}

/**
 * 線路の字。**横の区間の上か下を先に**試し (字は横に書くので収まりやすい)、
 * 次に縦の区間の右か左。切れた後の区間を見るので、チップの名札とは離れる。
 */
export function renderLineCaptions(
  specs: readonly LineSpec[],
  shapes: readonly Shape[],
  board: Board,
  f: number | null,
  layout: Layout,
  theme: Theme,
  placer: Placer,
): string {
  const size = theme.metrics.lineTextSize;
  return specs.map((spec) => {
    const shape = shapes.find((one) => one.id === spec.id);
    const length = (piece: Piece): number => Math.max(piece.rect.width, piece.rect.height);
    const pieces = [...(shape?.pieces ?? [])]
      .filter((piece) => piece.axis !== null)
      .sort((a, b) => (a.axis === b.axis ? length(b) - length(a) : a.axis === 'x' ? -1 : 1));
    if (pieces.length === 0) return '';
    const caption = lineCaption(spec, board, f);
    const candidates = pieces.flatMap((piece): Candidate[] => {
      const at = layout.toPx({ x: piece.rect.x, y: piece.rect.y });
      const [w, h] = [layout.len(piece.rect.width), layout.len(piece.rect.height)];
      // 2 段目は字の高さと余白 (placer の PAD) を空けた所。詰めると 1 段目と重なる。
      const [above, below, row] = [at.y - 2, at.y + h + size + 1, size * 1.45];
      return piece.axis === 'x'
        ? [
          // 真ん中の上・下、区間の端に揃えた上・下、それでも塞がっていれば 2 段目。
          { x: at.x + w / 2, y: above, anchor: 'middle' },
          { x: at.x + w / 2, y: below, anchor: 'middle' },
          { x: at.x, y: above, anchor: 'start' },
          { x: at.x + w, y: above, anchor: 'end' },
          { x: at.x, y: below, anchor: 'start' },
          { x: at.x + w, y: below, anchor: 'end' },
          { x: at.x + w / 2, y: above - row, anchor: 'middle' },
          { x: at.x + w / 2, y: below + row, anchor: 'middle' },
        ]
        : [
          { x: at.x + w + 2, y: at.y + h / 2 + size * 0.35, anchor: 'start' },
          { x: at.x - 2, y: at.y + h / 2 + size * 0.35, anchor: 'end' },
        ];
    });
    const chosen = placer.choose(candidates, caption, size, layout.board);
    return chosen === null ? '' : text(chosen, caption, theme, size);
  }).join('');
}

/** 結合の隙間 (`s0.3mm`)。**並んだ区間の端の先**に置く (隙間の上は線路が詰まっている)。 */
export function renderCouplings(couplings: readonly Coupling[], layout: Layout, theme: Theme, placer: Placer): string {
  const size = theme.metrics.lineTextSize;
  return couplings.map((coupling) => {
    const label = `s${formatMm(coupling.spacing)}mm`;
    const half = coupling.overlap / 2;
    const middle = layout.toPx(coupling.at);
    const candidates: Candidate[] = coupling.axis === 'y'
      ? [
        { x: middle.x, y: layout.toPx({ x: 0, y: coupling.at.y + half }).y + size + 2, anchor: 'middle' },
        { x: middle.x, y: layout.toPx({ x: 0, y: coupling.at.y - half }).y - 2, anchor: 'middle' },
        { x: middle.x, y: middle.y + size * 0.35, anchor: 'middle' },
      ]
      : [
        { x: layout.toPx({ x: coupling.at.x + half, y: 0 }).x + 2, y: middle.y + size * 0.35, anchor: 'start' },
        { x: layout.toPx({ x: coupling.at.x - half, y: 0 }).x - 2, y: middle.y + size * 0.35, anchor: 'end' },
        { x: middle.x, y: middle.y + size * 0.35, anchor: 'middle' },
      ];
    const chosen = placer.choose(candidates, label, size, layout.board);
    return chosen === null ? '' : text(chosen, label, theme, size);
  }).join('');
}

/** 部品の名札の字 (`C1 10p`)。 */
const labelOf = (footprint: Footprint): string =>
  clampText(footprint.part.value === null ? footprint.part.id : `${footprint.part.id} ${footprint.part.value}`, LIMITS.labelLength);

/** 名札の候補。**胴の上、下、右、左**。足のある部品は胴の脇から。 */
function labelCandidates(footprint: Footprint, layout: Layout, size: number): Candidate[] {
  const part = footprint.part;
  if (part.kind === 'edge') {
    // SMA は板の外の胴の脇 (左右の SMA は上、上下の SMA は右)。
    const reach = SMA.base + SMA.barrel;
    if (part.side === 'left' || part.side === 'right') {
      const x = part.side === 'left' ? -reach / 2 : footprint.center.x + reach / 2;
      const at = layout.toPx({ x, y: footprint.center.y - SMA.size / 2 });
      return [{ x: at.x, y: at.y - 3, anchor: 'middle' }];
    }
    const y = part.side === 'top' ? -reach / 2 : footprint.center.y + reach / 2;
    const at = layout.toPx({ x: footprint.center.x + SMA.size / 2, y });
    return [{ x: at.x + 3, y: at.y + size * 0.35, anchor: 'start' }];
  }
  if (part.kind === 'leaded' && footprint.ends !== undefined) {
    const [a, b] = footprint.ends;
    const span = layout.len(Math.hypot(b.x - a.x, b.y - a.y));
    const half = bodySize(bodyPart(footprint), span).height / 2;
    const at = layout.toPx(footprint.center);
    const beside: Candidate[] = [
      { x: at.x + half + 3, y: at.y + size * 0.35, anchor: 'start' },
      { x: at.x - half - 3, y: at.y + size * 0.35, anchor: 'end' },
    ];
    const across: Candidate[] = [
      { x: at.x, y: at.y - half - 3, anchor: 'middle' },
      { x: at.x, y: at.y + half + size + 2, anchor: 'middle' },
    ];
    return Math.abs(b.y - a.y) > Math.abs(b.x - a.x) ? [...beside, ...across] : [...across, ...beside];
  }
  const { outline } = footprint;
  const top = layout.toPx({ x: outline.x, y: outline.y });
  const [w, h] = [layout.len(outline.width), layout.len(outline.height)];
  return [
    { x: top.x + w / 2, y: top.y - 3, anchor: 'middle' },
    { x: top.x + w / 2, y: top.y + h + size + 2, anchor: 'middle' },
    { x: top.x + w + 3, y: top.y + h / 2 + size * 0.35, anchor: 'start' },
    { x: top.x - 3, y: top.y + h / 2 + size * 0.35, anchor: 'end' },
  ];
}

/** 部品の名札。**SMA は板の外、他は板の中**に置く。 */
export function renderPartLabels(footprints: readonly Footprint[], layout: Layout, theme: Theme, placer: Placer): string {
  const size = theme.metrics.textSize * 0.9;
  return footprints.map((footprint) => {
    const label = labelOf(footprint);
    const area = footprint.part.kind === 'edge' ? null : layout.board;
    const chosen = placer.choose(labelCandidates(footprint, layout, size), label, size, area);
    return chosen === null ? '' : text(chosen, label, theme, size, theme.palette.caption);
  }).join('');
}

/** 板の説明の 1 行。 */
export function renderDescription(board: Board, f: number | null, layout: Layout, theme: Theme): string {
  return svgText(layout.board.x, layout.descriptionBaseline, boardDescription(board, f), {
    anchor: 'start', fill: theme.palette.caption, 'font-size': num(theme.metrics.textSize),
  });
}
