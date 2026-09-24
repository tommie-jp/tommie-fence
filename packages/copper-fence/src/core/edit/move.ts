import type { EditResult } from 'fence-kit';
import { REWRITE_REFUSAL } from 'fence-kit';
import { formatMm, formatPoint, parsePoint, round2 } from '../model/point.ts';
import type { Mm } from '../types.ts';
import { endPoint } from './cells.ts';
import { nearestEdge, straighten } from './geometry.ts';
import { find, itemOf, listWords, read, rewrite, rewriteList } from './items.ts';
import type { Read } from './items.ts';
import { changed, refuse } from './result.ts';

const unreadable = (written: string): EditResult => refuse(`点として読めません: ${written}`);

const same = (a: Mm | null, b: Mm | null): boolean => a !== null && b !== null && a.x === b.x && a.y === b.y;

/** 線路の点の語 (値の頭の `line` の後ろ、幅の前)。 */
const pointCount = (words: readonly { text: string }[]): number =>
  words.slice(1).findIndex((word) => !word.text.includes(',')) + 1 || words.length;

/** 線路の点を書き直す (折れ目を足して縦横に直す)。 */
function relineEdits(state: Read, id: string, line: number | null, map: (points: readonly Mm[]) => readonly Mm[]): EditResult | { edits: ReturnType<typeof rewrite>; line: number } {
  const item = itemOf(state.lines, line, id);
  if (item === null) return refuse(`${id}: ${REWRITE_REFUSAL}`, line);
  const count = pointCount(item.words);
  const points = item.words.slice(1, count).map((word) => parsePoint(word.text));
  if (points.some((point) => point === null)) return refuse(`${id}: ${REWRITE_REFUSAL}`, line);
  const moved = straighten(map(points as Mm[]));
  if (moved.length < 2) return refuse(`${id} の両端が同じ点になります`, line);
  const words = [item.words[0]?.text ?? 'line', ...moved.map(formatPoint), ...item.words.slice(count).map((word) => word.text)];
  return { edits: rewrite(state.lines, item, words), line: item.line };
}

/** 部品・島を動かす。`to` は**基準の点** (`cellsOf` の先頭) の行き先。 */
export function movePart(source: string, handle: string, to: string, preview = false): EditResult {
  const target = parsePoint(to);
  if (target === null) return unreadable(to);
  const state = read(source);
  const found = find(state.doc, handle);
  if (found === null || found.kind === 'jumper') return refuse(`動かせるものではありません: ${handle}`);
  if (found.kind === 'line') {
    const first = found.shape.points[0];
    if (first === undefined) return refuse(`${handle} の点がありません`);
    const [dx, dy] = [target.x - first.x, target.y - first.y];
    const made = relineEdits(state, found.shape.id, found.shape.line, (points) =>
      points.map((point) => ({ x: round2(point.x + dx), y: round2(point.y + dy) })));
    return 'ok' in made ? made : changed(state.source, { edits: made.edits }, { preview, check: [made.line] });
  }
  const spec = found.kind === 'part' ? found.part : found.shape;
  const item = itemOf(state.lines, spec.line, spec.id);
  if (item === null) return refuse(`${spec.id}: ${REWRITE_REFUSAL}`, spec.line);
  const words = item.words.map((word) => word.text);

  if (found.kind === 'part' && found.part.kind === 'edge') {
    // **SMA は板の辺に載る。** 押した点から一番近い辺へ寄せる。
    const edge = nearestEdge(state.doc.board, target);
    words[1] = edge.side;
    words[2] = formatMm(edge.offset);
  } else if (found.kind === 'part' && found.part.kind === 'leaded') {
    const [a, b] = found.part.ends;
    if (parsePoint(a) === null || parsePoint(b) === null) {
      return refuse(`${spec.id} の端は島の名前で書いてあります (島を動かすか、端を点で書きます)`, spec.line);
    }
    const anchor = endPoint(state.doc, a);
    if (anchor === null) return refuse(`${spec.id} の端を読めません`, spec.line);
    const shift = (written: string): string => {
      const point = parsePoint(written) as Mm;
      return formatPoint({ x: round2(point.x + target.x - anchor.x), y: round2(point.y + target.y - anchor.y) });
    };
    words[1] = shift(a);
    words[2] = shift(b);
  } else {
    words[1] = formatPoint(target);
  }
  return changed(state.source, { edits: rewrite(state.lines, item, words) }, { preview, check: [item.line] });
}

/**
 * 点を動かす (マップの節点)。**同じ点を書いた物がまとめて動く** — 線路の点、
 * 足のある部品の点で書いた端、ジャンパの端。線路は縦横に直す。
 */
export function movePoint(source: string, from: string, to: string, preview = false): EditResult {
  const [was, now] = [parsePoint(from), parsePoint(to)];
  if (was === null) return unreadable(from);
  if (now === null) return unreadable(to);
  const state = read(source);
  const edits: ReturnType<typeof rewrite>[number][] = [];
  const touched: number[] = [];

  for (const spec of state.doc.copper) {
    if (spec.kind !== 'line' || !spec.points.some((point) => same(point, was))) continue;
    const made = relineEdits(state, spec.id, spec.line, (points) => points.map((point) => (same(point, was) ? now : point)));
    if ('ok' in made) return made;
    edits.push(...made.edits);
    touched.push(made.line);
  }
  for (const part of state.doc.parts) {
    if (part.kind !== 'leaded' || !part.ends.some((end) => same(parsePoint(end), was))) continue;
    const item = itemOf(state.lines, part.line, part.id);
    if (item === null) return refuse(`${part.id}: ${REWRITE_REFUSAL}`, part.line);
    const words = item.words.map((word, at) => (at > 0 && at < 3 && same(parsePoint(word.text), was) ? formatPoint(now) : word.text));
    edits.push(...rewrite(state.lines, item, words));
    touched.push(item.line);
  }
  for (const wire of state.doc.wires) {
    if (wire.line === null || ![wire.from, wire.to].some((end) => same(parsePoint(end), was))) continue;
    const words = listWords(state.lines, wire.line)?.map((word, at) =>
      ((at === 0 || at === 2) && same(parsePoint(word.text), was) ? formatPoint(now) : word.text));
    const made = words === undefined ? null : rewriteList(state.lines, wire.line, words);
    if (made === null) return refuse(`配線: ${REWRITE_REFUSAL}`, wire.line);
    edits.push(...made);
    touched.push(wire.line);
  }
  if (edits.length === 0) return refuse(`${from} には動かせる点がありません`);
  return changed(state.source, { edits }, { preview, check: touched });
}

/** 線路・ジャンパの**片方の端だけ**を付け替える (もう片方も幅も色も動かない)。 */
export function moveWireEnd(source: string, handle: string, end: 'from' | 'to', to: string): EditResult {
  const target = parsePoint(to);
  if (target === null) return unreadable(to);
  const state = read(source);
  const found = find(state.doc, handle);
  if (found?.kind === 'line') {
    const made = relineEdits(state, found.shape.id, found.shape.line, (points) =>
      (end === 'from' ? [target, ...points.slice(1)] : [...points.slice(0, -1), target]));
    return 'ok' in made ? made : changed(state.source, { edits: made.edits }, { check: [made.line] });
  }
  if (found?.kind !== 'jumper' || found.wire.line === null) return refuse(`配線ではありません: ${handle}`);
  const words = listWords(state.lines, found.wire.line)?.map((word) => word.text);
  if (words === undefined) return refuse(`配線: ${REWRITE_REFUSAL}`, found.wire.line);
  words[end === 'from' ? 0 : 2] = formatPoint(target);
  const made = rewriteList(state.lines, found.wire.line, words);
  return made === null
    ? refuse(`配線: ${REWRITE_REFUSAL}`, found.wire.line)
    : changed(state.source, { edits: made }, { check: [found.wire.line] });
}
