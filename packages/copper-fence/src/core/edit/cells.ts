import type { GridStep } from 'fence-kit';
import { edgePoint } from '../model/board.ts';
import { formatPoint, parsePoint, round2 } from '../model/point.ts';
import type { FenceDocument, Mm } from '../types.ts';
import { find, read } from './items.ts';

/**
 * 升 (マップの置き先) は **1mm ごと**。端数は殻が `step` に渡す (既定 1/2 = 0.5mm、
 * `Shift` で 1mm ちょうど)。番地の綴りは `formatPoint` の 1 つだけ。
 */
export const FINE = 2;

export function step(cell: string, rows: number, cols: number): string | null {
  const at = parsePoint(cell);
  if (at === null) return null;
  return formatPoint({ x: round2(at.x + cols), y: round2(at.y + rows) });
}

export function stepsTo(from: string, to: string): GridStep | null {
  const [a, b] = [parsePoint(from), parsePoint(to)];
  if (a === null || b === null) return null;
  return { rows: round2(b.y - a.y), cols: round2(b.x - a.x) };
}

/** 端 (島の名前か点) を点に。 */
export function endPoint(doc: FenceDocument, written: string): Mm | null {
  const point = parsePoint(written);
  if (point !== null) return point;
  const spec = doc.copper.find((one) => one.id === written);
  return spec !== undefined && spec.kind !== 'line' ? spec.at : null;
}

/** その物の点 (ゴーストの光らせ先・動かすときの基準)。**先頭が基準**。 */
export function cellsOf(source: string, handle: string): readonly string[] {
  const { doc } = read(source);
  const found = find(doc, handle);
  if (found === null) return [];
  const points = ((): readonly (Mm | null)[] => {
    switch (found.kind) {
      case 'line': return found.shape.points;
      case 'shape': return [found.shape.at];
      case 'jumper': return [endPoint(doc, found.wire.from), endPoint(doc, found.wire.to)];
      case 'part': {
        const part = found.part;
        if (part.kind === 'edge') return [edgePoint(doc.board, part.side, part.offset)];
        if (part.kind === 'leaded') return part.ends.map((end) => endPoint(doc, end));
        return [part.at];
      }
    }
  })();
  return points.filter((point): point is Mm => point !== null).map(formatPoint);
}
