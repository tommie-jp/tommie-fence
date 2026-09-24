import type { Aim, FenceBlock, Span } from 'fence-kit';
import { extractCopperFences } from '../fences.ts';
import { formatPoint, parsePoint } from '../model/point.ts';
import { find, itemOf, read } from './items.ts';

/** その行を含むフェンス (開き記号の行から閉じ記号の行まで)。 */
export function fenceAt(markdown: string, line: number): FenceBlock | null {
  for (const fence of extractCopperFences(markdown)) {
    const body = fence.source === '' ? 0 : fence.source.replace(/\n$/, '').split('\n').length;
    if (line >= fence.line && line <= fence.line + body + 1) return fence;
  }
  return null;
}

/** 行の中の点の語 (桁つき)。コメントの後ろは見ない。 */
function pointsOn(text: string): readonly { column: number; length: number; written: string }[] {
  const comment = text.indexOf(' #');
  const body = comment < 0 ? text : text.slice(0, comment);
  return [...body.matchAll(/-?[\d.]+,-?[\d.]+/g)].flatMap((found) => {
    const point = parsePoint(found[0]);
    return point === null ? [] : [{ column: found.index ?? 0, length: found[0].length, written: formatPoint(point) }];
  });
}

/** エディタのカーソルが指しているもの。**点の上なら節点、行の上ならその物**。 */
export function aimAt(source: string, line: number, column: number): Aim | null {
  const state = read(source);
  const text = state.lines[line - 1] ?? '';
  const on = pointsOn(text).find((point) => column >= point.column && column <= point.column + point.length);
  const { doc } = state;
  const lineShape = doc.copper.find((spec) => spec.kind === 'line' && spec.line === line);
  const wire = doc.wires.find((one) => one.line === line);
  const leaded = doc.parts.find((part) => part.kind === 'leaded' && part.line === line);
  if (on !== undefined && (lineShape !== undefined || wire !== undefined || leaded !== undefined)) return { kind: 'node', id: on.written };
  if (lineShape !== undefined || wire !== undefined) return { kind: 'wire', id: String(line) };
  const part = doc.parts.find((one) => one.line === line) ?? doc.copper.find((one) => one.line === line);
  return part === undefined ? null : { kind: 'part', id: part.id };
}

/** 掴んだ物が書かれている所 (エディタで光らせる先)。 */
export function spansOf(source: string, what: 'part' | 'node', id: string): readonly Span[] {
  const state = read(source);
  if (what === 'node') {
    const wanted = parsePoint(id);
    if (wanted === null) return [];
    const spelled = formatPoint(wanted);
    return state.lines.flatMap((text, index) => pointsOn(text)
      .filter((point) => point.written === spelled)
      .map((point) => ({ line: index + 1, column: point.column, length: point.length })));
  }
  const found = find(state.doc, id);
  if (found === null || found.kind === 'jumper') return [];
  const spec = found.kind === 'part' ? found.part : found.shape;
  const item = itemOf(state.lines, spec.line, spec.id);
  return item === null ? [] : [{ line: item.line, column: item.start, length: item.end - item.start }];
}
