import { normalizeNewlines } from 'fence-kit';
import type { Span } from 'fence-kit';
import { fenceError, safeToken } from '../errors.ts';
import { formatAddress } from '../model/address.ts';
import { parseFence } from '../parser/parseFence.ts';
import { diffAfter } from './diff.ts';
import type { MoveResult } from './move.ts';
import type { Address, DeviceSpec } from '../types.ts';

/**
 * 板の外の機器 (`device`) を升目から掴む。
 *
 * **機器は入れ子で書く**ので、1 行の綴りを書き換える部品の道 (`move.ts`)
 * には乗らない。動かすというのは `at:` を書き換えることで、行き先は
 * 板の外の番地 (`-a1` `n5`) か、上下の帯 (`top` / `bottom`)。
 *
 * 掴めないと、**図に出ているのに升目から触れないものが残る**
 * (実機で「基板外の部品もマウスコマンドの対象にする」)。
 */

/**
 * 機器の書かれている範囲。`BAT:` の行から、字下げが戻る手前まで。
 *
 * **名前の行は自分で探す。** パーサが持っている行は入れ子の中身の始まり
 * (`type: device`) なので、そこから上へ `名前:` を探す — 中身の字下げより
 * 浅い行が名前の行。
 */
export function deviceBlock(lines: readonly string[], device: DeviceSpec): { from: number; to: number } | null {
  if (device.line === null) return null;
  const inner = lines[device.line - 1];
  if (inner === undefined) return null;
  const innerIndent = inner.length - inner.trimStart().length;
  let from = device.line;
  for (let at = device.line - 1; at >= 1; at -= 1) {
    const line = lines[at - 1];
    if (line === undefined) break;
    if (line.trim() === '') continue;
    if (line.length - line.trimStart().length < innerIndent) {
      from = at;
      break;
    }
  }
  const head = lines[from - 1];
  if (head === undefined) return null;
  const indent = head.length - head.trimStart().length;
  let to = from;
  for (let at = from; at < lines.length; at += 1) {
    const line = lines[at];
    if (line === undefined) break;
    if (line.trim() === '') break;
    if (line.length - line.trimStart().length <= indent) break;
    to = at + 1;
  }
  return { from, to };
}

const deviceOf = (source: string, id: string): DeviceSpec | null =>
  parseFence(normalizeNewlines(source)).doc?.devices.find((one) => one.id === id) ?? null;

/** その名前が板の外の機器か。**部品と機器で編集の道が違う**ので、入口で分ける。 */
export const isDevice = (source: string, id: string): boolean => deviceOf(source, id) !== null;

/** 升目で掴める機器の名前。読めないフェンスでは空。 */
export function deviceIds(source: string): readonly string[] {
  const { doc } = parseFence(normalizeNewlines(source));
  return doc === null ? [] : doc.devices.filter((one) => one.line !== null).map((one) => one.id);
}

/** `at:` の値が書かれている場所。書いていなければ null (既定の `top`)。 */
function atToken(
  lines: readonly string[], block: { from: number; to: number },
): { line: number; column: number; length: number } | null {
  for (let at = block.from; at <= block.to; at += 1) {
    const line = lines[at - 1];
    if (line === undefined) continue;
    const found = /^(\s*at:\s*)(\S+)/.exec(line);
    // 桁は 0 始まり (`locateTokens` と同じ数え方)。
    if (found) return { line: at, column: (found[1] ?? '').length, length: (found[2] ?? '').length };
  }
  return null;
}

/** その機器の場所が書かれている所。エディタで光らせるのに使う。 */
export function deviceSpans(source: string, id: string): readonly Span[] {
  const normalized = normalizeNewlines(source);
  const device = deviceOf(normalized, id);
  if (device === null) return [];
  const lines = normalized.split('\n');
  const block = deviceBlock(lines, device);
  if (block === null) return [];
  const token = atToken(lines, block);
  // `at:` を書いていない機器は、名前の行を光らせる (そこに足す)。
  if (token !== null) return [token];
  const head = lines[block.from - 1] ?? '';
  const column = head.length - head.trimStart().length;
  return [{ line: block.from, column, length: id.length }];
}

/**
 * 機器を動かす。**書き換えるのは `at:` の 1 行**で、無ければ `type:` の次に足す。
 * 行き先は板の外の番地 — 板の上に落としたときは、呼ぶ側が帯へ寄せる綴り
 * (`top` / `bottom`) を渡す。
 */
export function moveDevice(source: string, id: string, to: string, trial = false): MoveResult {
  const normalized = normalizeNewlines(source);
  const device = deviceOf(normalized, id);
  if (device === null) {
    return { ok: false, error: fenceError(`機器が見つかりません: ${safeToken(id)}`, null) };
  }
  const lines = normalized.split('\n');
  const block = deviceBlock(lines, device);
  if (block === null) {
    return { ok: false, error: fenceError(`${safeToken(id)} の行が分かりません`, null) };
  }

  const token = atToken(lines, block);
  if (token !== null) {
    const edits = [{ line: token.line, column: token.column, length: token.length, text: to }];
    return { ok: true, value: { edits, diff: trial ? { lost: [], gained: [] } : diffAfter(normalized, edits) } };
  }

  // **`at:` が無いときは足す。** 字下げは `type:` の行に合わせる (同じ入れ子)。
  const inner = lines[block.from] ?? '';
  const indent = inner.length - inner.trimStart().length;
  const edits = [{
    line: block.from, column: (lines[block.from - 1] ?? '').length, length: 0,
    text: `\n${' '.repeat(indent)}at: ${to}`,
  }];
  return { ok: true, value: { edits, diff: trial ? { lost: [], gained: [] } : diffAfter(normalized, edits) } };
}

/** 落ちた穴を `at:` に書ける綴りへ。板の外の番地はそのまま使える。 */
export const deviceTarget = (at: Address): string => formatAddress(at);

/**
 * その機器が載っている穴。**番地で置いたときだけ**返す — 帯に並べた機器は
 * 板の格子に載っていないので、指せる穴が無い (掴んで動かすには、まず番地で
 * 置いてもらう)。まとめて動かすときの起点にも使う (`session.cellsOf`)。
 */
export function deviceCells(source: string, id: string): readonly string[] {
  const device = deviceOf(normalizeNewlines(source), id);
  return device?.where == null ? [] : [device.where];
}
