import { FLOW_REFUSAL, dropLines, emptiedUnder, isKeyLine, keyLineOf } from 'fence-kit';
import type { Edit, EditResult } from 'fence-kit';
import { formatPoint } from '../model/point.ts';
import { find, itemOf, listWords, read, rewrite, rewriteList } from './items.ts';
import { changed, refuse } from './result.ts';

/**
 * 部品・島を消す。**消した島を名前で指していた端は、その島の中心の点に書き換える**
 * — 足のある部品やジャンパが「知らない名前」で読めなくならず、その場に残る。
 */
export function deletePart(source: string, handle: string): EditResult {
  const state = read(source);
  const found = find(state.doc, handle);
  if (found === null || found.kind === 'jumper') return refuse(`消せるものではありません: ${handle}`);
  const spec = found.kind === 'part' ? found.part : found.shape;
  if (spec.line === null) return refuse(`${spec.id} の行が分かりません`);
  const key = found.kind === 'part' ? 'parts' : 'copper';
  const others = found.kind === 'part' ? state.doc.parts : state.doc.copper;
  if (isKeyLine(state.lines[spec.line - 1], key) || others.some((one) => one !== spec && one.line === spec.line)) {
    return refuse(`${spec.id}: ${FLOW_REFUSAL}`, spec.line);
  }
  const drop = new Set([spec.line]);
  if (others.length === 1 && emptiedUnder(state.lines, key, drop)) drop.add(keyLineOf(state.lines, key));

  // 名前で指されていた島なら、指している端を点に書き換える。
  const edits: Edit[] = [];
  if (found.kind === 'shape') {
    const point = formatPoint(found.shape.at);
    for (const part of state.doc.parts) {
      if (part.kind !== 'leaded' || !part.ends.includes(spec.id)) continue;
      const item = itemOf(state.lines, part.line, part.id);
      if (item === null) continue;
      edits.push(...rewrite(state.lines, item, item.words.map((word, at) => (at > 0 && at < 3 && word.text === spec.id ? point : word.text))));
    }
    for (const wire of state.doc.wires) {
      if (wire.line === null || (wire.from !== spec.id && wire.to !== spec.id)) continue;
      const words = listWords(state.lines, wire.line)?.map((word, at) => ((at === 0 || at === 2) && word.text === spec.id ? point : word.text));
      const made = words === undefined ? null : rewriteList(state.lines, wire.line, words);
      if (made !== null) edits.push(...made);
    }
  }
  return changed(state.source, { edits, lines: dropLines(drop), wires: 0 });
}

/** 線路・ジャンパを消す (`line` は行番号)。 */
export function deleteWire(source: string, line: number): EditResult {
  const state = read(source);
  const found = find(state.doc, `wire:${line}`);
  if (found === null) return refuse(`${line} 行目に線路も配線もありません`, line);
  const key = found.kind === 'line' ? 'copper' : 'wires';
  if (isKeyLine(state.lines[line - 1], key)) return refuse(`${key === 'copper' ? '線路' : '配線'}: ${FLOW_REFUSAL}`, line);
  const drop = new Set([line]);
  const count = found.kind === 'line' ? state.doc.copper.length : state.doc.wires.length;
  if (count === 1 && emptiedUnder(state.lines, key, drop)) drop.add(keyLineOf(state.lines, key));
  return changed(state.source, { lines: dropLines(drop) });
}
