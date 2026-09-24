import { REWRITE_REFUSAL, RENAME_REFUSAL, wireColor } from 'fence-kit';
import type { Edit, EditResult, PartFields } from 'fence-kit';
import { isReferenceable } from '../limits.ts';
import { formatPoint, parseLength, parsePoint, parseSize } from '../model/point.ts';
import { isOrientWord } from '../parser/orient.ts';
import { parseCopperLine } from '../parser/copper.ts';
import { parsePartLine } from '../parser/parts.ts';
import type { Mm, PartSpec } from '../types.ts';
import { turnAround } from './geometry.ts';
import { cutUnderChips } from '../geometry/cut.ts';
import { shapesOf } from '../geometry/shapes.ts';
import { find, itemOf, listWords, read, rewrite, rewriteList } from './items.ts';
import type { Item, Read } from './items.ts';
import { changed, refuse } from './result.ts';

/** 部品の語のうち、形 (置き方) を書く語の数。残りが値 (向きの語は除く)。 */
const shapeWords = (part: PartSpec): number => {
  switch (part.kind) {
    case 'edge': return 3;
    case 'leaded': return 3;
    case 'box': return 4;
    default: return 2;
  }
};

/** 語を「形」「向き」「値」に分ける。 */
function splitWords(part: PartSpec, item: Item): { shape: string[]; orient: string[]; value: string[] } {
  const words = item.words.map((word) => word.text);
  const count = shapeWords(part);
  const rest = words.slice(count);
  const turnable = part.kind === 'chip' || part.kind === 'sot' || part.kind === 'box';
  return {
    shape: words.slice(0, count),
    orient: turnable ? rest.filter((word) => isOrientWord(word.toLowerCase())) : [],
    value: turnable ? rest.filter((word) => !isOrientWord(word.toLowerCase())) : rest,
  };
}

/** 線路の幅の語の位置 (点の後ろ)。 */
const widthAt = (item: Item): number => item.words.findIndex((word, at) => at > 0 && !word.text.includes(','));

/** 選んだ物の欄。 */
export function fieldsOf(source: string, handle: string): PartFields | null {
  const state = read(source);
  const found = find(state.doc, handle);
  if (found === null) return null;
  switch (found.kind) {
    case 'part':
      return {
        id: found.part.id,
        type: found.part.variant === null ? found.part.type : `${found.part.type}/${found.part.variant}`,
        value: found.part.value ?? '', label: '', color: '', can: ['id', 'type', 'value'],
      };
    case 'shape': {
      const spec = found.shape;
      const value = spec.kind === 'via' ? String(spec.drill) : `${spec.width}x${spec.height}`;
      return { id: spec.id, type: spec.kind, value, label: '', color: '', can: ['id', 'value'] };
    }
    case 'line':
      return { id: found.shape.id, type: 'line', value: String(found.shape.width), label: '', color: '', can: ['id', 'value'] };
    case 'jumper':
      return { id: `配線 (${found.wire.line ?? '?'} 行目)`, type: '--', value: '', label: '', color: found.wire.color ?? '', can: ['color'], kinds: ['--'] };
  }
}

/** 改名。**その名前を端に書いた所 (足のある部品・ジャンパ) も書き換える**。 */
export function rename(source: string, handle: string, to: string): EditResult {
  const state = read(source);
  const found = find(state.doc, handle);
  if (found === null || found.kind === 'jumper') return refuse(`名前を持たないものです: ${handle}`);
  const spec = found.kind === 'part' ? found.part : found.shape;
  const name = to.trim();
  if (name === spec.id) return changed(state.source, { edits: [] });
  if (!isReferenceable(name)) return refuse(`名前に使えません: ${name} (英数字と _ - で 32 字まで)`);
  if (parsePoint(name) !== null) return refuse(`点と同じ綴りは名前にできません: ${name}`);
  const taken = [...state.doc.parts.map((part) => part.id), ...state.doc.copper.map((one) => one.id)];
  if (taken.includes(name)) return refuse(`その名前はもうあります: ${name}`);
  const item = itemOf(state.lines, spec.line, spec.id);
  if (item === null) return refuse(`${spec.id}: ${RENAME_REFUSAL}`, spec.line);
  const text = state.lines[item.line - 1] ?? '';
  const keyLength = text.slice(item.start).startsWith(spec.id) ? spec.id.length : spec.id.length + 2;
  const edits: Edit[] = [{ line: item.line, column: item.start, length: keyLength, text: name }];
  for (const part of state.doc.parts) {
    if (part.kind !== 'leaded' || !part.ends.includes(spec.id)) continue;
    const other = itemOf(state.lines, part.line, part.id);
    if (other === null) return refuse(`${part.id}: ${RENAME_REFUSAL}`, part.line);
    edits.push(...rewrite(state.lines, other, other.words.map((word, at) => (at > 0 && at < 3 && word.text === spec.id ? name : word.text))));
  }
  for (const wire of state.doc.wires) {
    if (wire.line === null || (wire.from !== spec.id && wire.to !== spec.id)) continue;
    const words = listWords(state.lines, wire.line)?.map((word, at) => ((at === 0 || at === 2) && word.text === spec.id ? name : word.text));
    const made = words === undefined ? null : rewriteList(state.lines, wire.line, words);
    if (made === null) return refuse(`配線: ${RENAME_REFUSAL}`, wire.line);
    edits.push(...made);
  }
  return changed(state.source, { edits });
}

/** 1 行を書き換えて答えにする (読み直して読めなければ断る)。 */
function rewritten(state: Read, item: Item, words: readonly string[]): EditResult {
  return changed(state.source, { edits: rewrite(state.lines, item, words) }, { check: [item.line] });
}

/** 欄を直す。 */
export function setField(source: string, handle: string, field: string, text: string): EditResult {
  if (field === 'id') return rename(source, handle, text);
  const state = read(source);
  const found = find(state.doc, handle);
  if (found === null) return refuse(`見つかりません: ${handle}`);
  const written = text.trim();

  if (found.kind === 'jumper') {
    if (field !== 'color') return refuse(`配線に ${field} の欄はありません`);
    if (written !== '' && wireColor(written) === null) return refuse(`線の色として読めません: ${written}`);
    const line = found.wire.line ?? 0;
    const words = listWords(state.lines, line)?.map((word) => word.text).slice(0, 3);
    const made = words === undefined ? null : rewriteList(state.lines, line, written === '' ? words : [...words, written]);
    return made === null ? refuse(`配線: ${REWRITE_REFUSAL}`, line) : changed(state.source, { edits: made }, { check: [line] });
  }

  const spec = found.kind === 'part' ? found.part : found.shape;
  const item = itemOf(state.lines, spec.line, spec.id);
  if (item === null) return refuse(`${spec.id}: ${REWRITE_REFUSAL}`, spec.line);
  const words = item.words.map((word) => word.text);

  if (found.kind === 'part') {
    const parts = splitWords(found.part, item);
    if (field === 'value') return rewritten(state, item, [...parts.shape, ...parts.orient, ...(written === '' ? [] : [written])]);
    if (field !== 'type') return refuse(`この部品に ${field} の欄はありません`);
    const next = [written, ...words.slice(1)];
    const reread = parsePartLine(found.part.id, next.join(' '));
    if (!reread.ok) return refuse(reread.error.message, found.part.line);
    if (reread.value.kind !== found.part.kind) return refuse(`${written} は置き方が違うので、書き換えずに置き直します`, found.part.line);
    return rewritten(state, item, next);
  }

  if (field !== 'value') return refuse(`${spec.id} に ${field} の欄はありません`);
  if (found.kind === 'line') {
    const at = widthAt(item);
    if (parseLength(written) === null) return refuse(`線路の幅として読めません: ${written}`);
    return rewritten(state, item, words.map((word, index) => (index === at ? written : word)));
  }
  const shape = found.shape;
  const valid = shape.kind === 'via' ? parseLength(written) !== null : parseSize(written) !== null;
  if (!valid) return refuse(`${shape.kind === 'via' ? '穴の径' : '大きさ'}として読めません: ${written}`);
  const next = [...words.slice(0, 2), written, ...words.slice(3)];
  const reread = parseCopperLine(shape.id, next.join(' '));
  return reread.ok ? rewritten(state, item, next) : refuse(reread.error.message, shape.line);
}

/**
 * 向きの語が無いチップの**いまの向き**。乗った線路に従うので、縦の線路の上なら 90 度。
 * 0 度から数えると、1 回目の回転が効かず、裏返すと横に倒れて線路を切らなくなる。
 */
function drawnTurn(state: Read, part: PartSpec): number {
  if (part.kind !== 'chip' && part.kind !== 'sot' && part.kind !== 'box') return 0;
  if (part.orient !== null) return part.orient.turn;
  if (part.kind !== 'chip') return 0;
  const shapes = shapesOf(state.doc.copper, state.doc.board).shapes;
  const axes = cutUnderChips(shapes, [{ part: part.id, at: part.at, axis: null, gap: 0.01 }]).axes;
  return axes.get(part.id) === 'y' ? 90 : 0;
}

/** 向きの語を書き直す (回す・裏返す)。 */
function reorient(state: Read, part: PartSpec, item: Item, turn: number, mirror: boolean): EditResult {
  const parts = splitWords(part, item);
  const words = [...parts.shape, ...(turn === 0 ? [] : [`r${turn}`]), ...(mirror ? ['mirror'] : []), ...parts.value];
  return rewritten(state, item, words);
}

/** 回す (時計回りに 90 度 × `quarters`)。 */
export function turn(source: string, handle: string, quarters: number): EditResult {
  const state = read(source);
  const found = find(state.doc, handle);
  if (found === null || found.kind === 'jumper' || found.kind === 'line') return refuse(`回せるものではありません: ${handle}`);
  const spec = found.kind === 'part' ? found.part : found.shape;
  const item = itemOf(state.lines, spec.line, spec.id);
  if (item === null) return refuse(`${spec.id}: ${REWRITE_REFUSAL}`, spec.line);
  const words = item.words.map((word) => word.text);
  if (found.kind === 'shape') {
    const shape = found.shape;
    if (shape.kind === 'via' || quarters % 2 === 0) return changed(state.source, { edits: [] });
    return rewritten(state, item, [...words.slice(0, 2), `${shape.height}x${shape.width}`, ...words.slice(3)]);
  }
  const part = found.part;
  if (part.kind === 'edge') return refuse(`${part.id} の向きは載せる辺で決まります (動かすと辺が変わります)`, part.line);
  if (part.kind === 'leaded') {
    const ends = part.ends.map((end) => parsePoint(end));
    if (ends.some((end) => end === null)) return refuse(`${part.id} の端は島の名前で書いてあるので回せません`, part.line);
    const [a, b] = ends as [Mm, Mm];
    const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    return rewritten(state, item, [words[0] ?? part.type, formatPoint(turnAround(a, center, quarters)), formatPoint(turnAround(b, center, quarters)), ...words.slice(3)]);
  }
  const now = drawnTurn(state, part);
  const next = ((now + quarters * 90) % 360 + 360) % 360;
  return reorient(state, part, item, next, part.orient?.mirror ?? false);
}

/** 裏返す。足のある部品は両端を入れ替える。 */
export function flip(source: string, handle: string): EditResult {
  const state = read(source);
  const found = find(state.doc, handle);
  if (found === null || found.kind !== 'part') return refuse(`裏返せるものではありません: ${handle}`);
  const part = found.part;
  const item = itemOf(state.lines, part.line, part.id);
  if (item === null) return refuse(`${part.id}: ${REWRITE_REFUSAL}`, part.line);
  if (part.kind === 'edge') return refuse(`${part.id} は裏返せません`, part.line);
  if (part.kind === 'leaded') {
    const words = item.words.map((word) => word.text);
    return rewritten(state, item, [words[0] ?? part.type, words[2] ?? '', words[1] ?? '', ...words.slice(3)]);
  }
  return reorient(state, part, item, drawnTurn(state, part), !(part.orient?.mirror ?? false));
}
