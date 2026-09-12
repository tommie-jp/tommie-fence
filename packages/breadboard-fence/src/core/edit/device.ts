import { normalizeNewlines } from 'fence-kit';
import type { Edit, EditResult, LineEdit, NetDiff, Span } from 'fence-kit';
import { fenceError, safeToken } from '../errors.ts';
import { LIMITS } from '../limits.ts';
import { isTopBlock } from '../model/address.ts';
import { parseFence } from '../parser/parseFence.ts';
import { diffAfter, diffAfterLines } from './diff.ts';
import { partFields } from './field.ts';
import type { PartField } from './field.ts';
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
  const found = parseFence(normalizeNewlines(source)).doc.parts.find((one) => one.id === id);
  return found?.type === 'device' ? found : null;
};

/** その名前が板の外の機器か。**部品と機器で編集の道が違う**ので、入口で分ける。 */
export const isDevice = (source: string, id: string): boolean => deviceOf(source, id) !== null;

/** 升目で掴める機器の名前。読めた行のぶんだけ出る。 */
export function deviceIds(source: string): readonly string[] {
  const { doc } = parseFence(normalizeNewlines(source));
  return doc.parts.filter((one) => one.type === 'device' && one.line !== null).map((one) => one.id);
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

/**
 * その機器のブロックの中身の行 (鍵の行は含まない)。**消すのはブロックごと** —
 * 鍵の行だけ消すと中身が宙に浮いて、フェンスそのものが読めなくなる。
 */
export function deviceBlock(source: string, id: string): readonly number[] {
  const normalized = normalizeNewlines(source);
  const device = deviceOf(normalized, id);
  if (device?.line == null) return [];
  const lines = normalized.split('\n');
  const block = blockOf(lines, device.line);
  const inside: number[] = [];
  for (let at = block.from + 1; at <= block.to; at += 1) inside.push(at);
  return inside;
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

/**
 * 機器の欄。**書けるのは名前とラベルだけ。**
 *
 * 値は文法が使わない (箱に出るのは `label ?? id`。`parser/schema.ts` が
 * 「機器に value は使いません」と言う) し、種類は `device` そのものなので
 * 打ち替える先が無い。欄に出して受け付けないと、**直せるように見えて直せない**
 * (実機で属性パネルから触れなかった)。
 */
export const deviceFields = (source: string, id: string): ReturnType<typeof partFields> => {
  const fields = partFields(source, id);
  return fields === null ? null : { ...fields, value: '', can: ['id', 'label'] };
};

const fieldFail = (message: string, line: number | null): EditResult =>
  ({ ok: false, error: fenceError(message, line) });

/** 行を足す書き換えの答え。**中身は `insert.ts` の `AdditionResult` と同じ形**。 */
type AdditionResult =
  | {
    readonly ok: true;
    readonly value: { readonly edits: readonly Edit[]; readonly lines: readonly LineEdit[]; readonly diff: NetDiff };
  }
  | { readonly ok: false; readonly error: ReturnType<typeof fenceError> };

/** ブロックの中の `key:` の値が書かれている所。無ければ null。 */
function valueToken(
  lines: readonly string[],
  block: { from: number; to: number },
  key: string,
): { line: number; column: number; length: number } | null {
  for (let at = block.from; at <= block.to; at += 1) {
    const found = new RegExp(`^(\\s*${key}:[ \\t]*)(.*)$`).exec(lines[at - 1] ?? '');
    if (found) return { line: at, column: (found[1] ?? '').length, length: (found[2] ?? '').trimEnd().length };
  }
  return null;
}

/** ラベルに書ける字か。**ブロックの形を壊す字は通さない** (1 行記法と同じ見方)。 */
function badLabel(text: string): string | null {
  if (text.includes('#')) return 'YAML のコメントになるので `#` は書けません';
  if (/[:{}[\],]/.test(text)) return 'YAML の記号 (`:` `{` `}` `[` `]` `,`) は書けません';
  if ([...text].length > LIMITS.labelLength) return `${LIMITS.labelLength} 文字までです`;
  return null;
}

/**
 * 機器のラベルを書き換える。**ブロックの中の 1 行だけ**を直す
 * (`type:` や `pins:` は動かさない)。無ければ `type:` の次に足し、
 * 空にするなら行ごと消す (空の `label:` を残さない)。
 */
export function setDeviceField(source: string, id: string, field: PartField, text: string): EditResult {
  const normalized = normalizeNewlines(source);
  const device = deviceOf(normalized, id);
  if (device?.line == null) return fieldFail(`機器が見つかりません: ${safeToken(id)}`, null);
  if (field !== 'label') {
    return fieldFail(
      `機器に${field === 'type' ? '種類' : '値'}は書けません`
      + ` (箱に出る名前は${field === 'type' ? 'ラベル' : 'ラベル'}に書きます)`,
      device.line,
    );
  }

  const written = text.trim();
  const problem = badLabel(written);
  if (problem !== null) return fieldFail(`${safeToken(id)} のラベル: ${problem}`, device.line);

  const lines = normalized.split('\n');
  const block = blockOf(lines, device.line);
  const token = valueToken(lines, block, 'label');

  // **空にするなら行ごと消す** (中身の無い `label:` を残さない)。書き換えは
  // 行の中に閉じるものなので、行の出し入れは `lines` のほうで頼む。
  if (token !== null && written === '') {
    const removed: readonly LineEdit[] = [{ kind: 'delete', line: token.line }];
    return { ok: true, value: { edits: [], lines: removed, diff: diffAfterLines(normalized, removed) } };
  }
  const edits: readonly Edit[] = token !== null
    ? [{ line: token.line, column: token.column, length: token.length, text: written }]
    : written === ''
      ? []
      : [{
        line: block.from,
        column: (lines[block.from - 1] ?? '').length,
        length: 0,
        text: `\n${' '.repeat(indentOf(lines[block.from] ?? ''))}label: ${written}`,
      }];
  return { ok: true, value: { edits, diff: diffAfter(normalized, edits) } };
}

/**
 * 機器をもう 1 つ。**ブロックをそのまま写して、鍵だけ差し替える。**
 *
 * 写しには配線が付かないが、**それでも図には出る** (帯に並ぶ機器の左右は
 * つながる穴が決めるので、つながっていなければ既定の場所に出る)。
 * 出ないと思って断っていたが、実際に描いてみたら出た。
 *
 * 写す先は**元のブロックのすぐ後ろ**。部品の複製が斜めに 1 穴ずらすのと同じで、
 * 元のそばに出したほうが「増えた」ことが分かる。
 */
export function duplicateDevice(source: string, id: string, newId: string): AdditionResult {
  const normalized = normalizeNewlines(source);
  const { doc } = parseFence(normalized);
  const device = deviceOf(normalized, id);
  if (device?.line == null) {
    return { ok: false, error: fenceError(`機器が見つかりません: ${safeToken(id)}`, null) };
  }
  if (doc.parts.some((one) => one.id === newId)) {
    return { ok: false, error: fenceError(`その名前はもう使われています: ${safeToken(newId)}`, device.line) };
  }

  const lines = normalized.split('\n');
  const block = blockOf(lines, device.line);
  // **鍵の行だけ名前を差し替え、中身はそのまま写す** (`pins:` の並びも
  // `label:` も、手で整えた並びごと残る)。
  const copied = [
    (lines[block.from - 1] ?? '').replace(/^(\s*)[^\s:]+\s*:/, `$1${newId}:`),
    ...lines.slice(block.from, block.to),
  ];
  const added: readonly LineEdit[] = copied.map((text, index) => ({
    kind: 'insert' as const, line: block.to + 1 + index, text,
  }));
  return { ok: true, value: { edits: [], lines: added, diff: diffAfterLines(normalized, added) } };
}

/** その機器のピンを指している配線の綴り (`AD2.V+` の `AD2` の所)。 */
export function devicePinSpans(source: string, id: string): readonly Span[] {
  const normalized = normalizeNewlines(source);
  const { doc } = parseFence(normalized);
  const lines = normalized.split('\n');
  const spans: Span[] = [];
  for (const wire of doc.wires) {
    const text = lines[wire.line - 1] ?? '';
    for (const found of text.matchAll(new RegExp(`(^|[^\\w-])(${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})\\.`, 'g'))) {
      spans.push({
        line: wire.line,
        column: (found.index ?? 0) + (found[1] ?? '').length,
        length: id.length,
      });
    }
  }
  return spans;
}
