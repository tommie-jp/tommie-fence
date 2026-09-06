import { normalizeNewlines } from 'fence-kit';
import type { Span } from 'fence-kit';
import { fenceError, safeToken } from '../errors.ts';
import { isTopBlock } from '../model/address.ts';
import { parseFence } from '../parser/parseFence.ts';
import { diffAfter } from './diff.ts';
import type { MoveResult } from './move.ts';
import type { Address, PartSpec } from '../types.ts';

/**
 * 板の外の機器 (`device`) を升目から掴む。
 *
 * **機器は入れ子で書く**ので、1 行の綴りを書き換える部品の道 (`move.ts`) には
 * 乗らない。この板で動かすというのは `at:` を上下どちらの帯にするかで、
 * 左右の位置はつながる穴から自動で決まる (文法リファレンス)。
 *
 * 掴めないと、**図に出ているのに升目から触れないものが残る**
 * (実機で「ブレッドボード外にある部品も選択、動かす…の対象にする」)。
 */

const deviceOf = (source: string, id: string): PartSpec | null => {
  const found = parseFence(normalizeNewlines(source)).doc?.parts.find((one) => one.id === id);
  return found?.type === 'device' ? found : null;
};

/** その名前が板の外の機器か。**部品と機器で編集の道が違う**ので、入口で分ける。 */
export const isDevice = (source: string, id: string): boolean => deviceOf(source, id) !== null;

/** 升目で掴める機器の名前。読めないフェンスでは空。 */
export function deviceIds(source: string): readonly string[] {
  const { doc } = parseFence(normalizeNewlines(source));
  return doc === null
    ? []
    : doc.parts.filter((one) => one.type === 'device' && one.line !== null).map((one) => one.id);
}

/** 機器の書かれている範囲。`AD2:` の行から、字下げが戻る手前まで。 */
function blockOf(lines: readonly string[], line: number): { from: number; to: number } {
  const head = lines[line - 1] ?? '';
  const indent = head.length - head.trimStart().length;
  let to = line;
  for (let at = line; at < lines.length; at += 1) {
    const one = lines[at];
    if (one === undefined || one.trim() === '') break;
    if (one.length - one.trimStart().length <= indent) break;
    to = at + 1;
  }
  return { from: line, to };
}

/** `at:` の値が書かれている所。書いていなければ null (既定の `top`)。 */
function atToken(
  lines: readonly string[], block: { from: number; to: number },
): { line: number; column: number; length: number } | null {
  for (let at = block.from; at <= block.to; at += 1) {
    const found = /^(\s*at:\s*)(\S+)/.exec(lines[at - 1] ?? '');
    // 桁は 0 始まり (`locateTokens` と同じ数え方)。
    if (found) return { line: at, column: (found[1] ?? '').length, length: (found[2] ?? '').length };
  }
  return null;
}

/** その機器の場所が書かれている所。エディタで光らせるのに使う。 */
export function deviceSpans(source: string, id: string): readonly Span[] {
  const normalized = normalizeNewlines(source);
  const device = deviceOf(normalized, id);
  if (device?.line == null) return [];
  const lines = normalized.split('\n');
  const block = blockOf(lines, device.line);
  const token = atToken(lines, block);
  if (token !== null) return [token];
  // `at:` を書いていない機器は、名前の行を光らせる (そこに足す)。
  const head = lines[block.from - 1] ?? '';
  return [{ line: block.from, column: head.length - head.trimStart().length, length: id.length }];
}

/**
 * 機器を動かす。**この板で選べるのは上下の帯だけ**なので、落とした穴が溝より
 * 上なら `top`、下なら `bottom` にする。`at:` が無ければ `type:` の次に足す。
 */
export function moveDevice(source: string, id: string, to: Address, trial = false): MoveResult {
  const normalized = normalizeNewlines(source);
  const device = deviceOf(normalized, id);
  if (device?.line == null) {
    return { ok: false, error: fenceError(`機器が見つかりません: ${safeToken(id)}`, null) };
  }
  const side = sideOf(to);
  const lines = normalized.split('\n');
  const block = blockOf(lines, device.line);
  const token = atToken(lines, block);

  const edits = token !== null
    ? [{ line: token.line, column: token.column, length: token.length, text: side }]
    // **字下げは中身の行に合わせる** (同じ入れ子に足す)。
    : [{
      line: block.from,
      column: (lines[block.from - 1] ?? '').length,
      length: 0,
      text: `\n${' '.repeat(indentOf(lines[block.from] ?? ''))}at: ${side}`,
    }];
  return { ok: true, value: { edits, diff: trial ? { lost: [], gained: [] } : diffAfter(normalized, edits) } };
}

const indentOf = (line: string): number => line.length - line.trimStart().length;

/** 落とした穴から帯を決める。溝より上なら上の帯、下なら下の帯。 */
const sideOf = (to: Address): 'top' | 'bottom' =>
  (to.kind === 'hole' ? (isTopBlock(to.row) ? 'top' : 'bottom') : (to.side === 't' ? 'top' : 'bottom'));

/**
 * その機器が載っている穴。**帯に並べた機器には指せる穴が無い** (左右の位置は
 * つながる穴から決まる) ので空を返す。まとめて動かす起点には使えない。
 */
export const deviceCells = (): readonly string[] => [];
