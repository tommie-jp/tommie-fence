import { formatAddress } from '../model/address.ts';
import type { Address, WireOperator } from '../model/address.ts';
import { isReferenceable, LIMITS } from '../limits.ts';
import { normalizeNewlines } from '../newlines.ts';
import { lookupPartType, lookupPin } from '../parts.ts';
import { parseFence } from '../parser/parseFence.ts';
import type { Endpoint } from '../types.ts';
import { applyRewrite, diffOf, fail, isOnGrid } from './shared.ts';
import type { LineEdit, RewriteResult } from './shared.ts';

/**
 * 部品と配線を足す。**フェンス本文 → 書き換えの並び**を返す純関数で、
 * vscode を知らない (設計上の約束 1)。
 *
 * **足すのは行ごと。** 1 部品 = 1 行、1 配線 = 1 本の経路という文法の読みと
 * 揃える (消すほうと同じ単位)。**YAML を組み直さない**ので、手書きの
 * コメントも整形も並び順もそのまま残る。
 *
 * **フロー形式 (`parts: {…}` / `wires: [...]`) は断る。** その書き方では
 * 行が部品 1 つに対応しないので、行を足す場所が決まらない。
 */

/** 置く部品 1 つ。値やラベルは後から欄で足す (置く時点では要らない)。 */
export type NewPart = {
  readonly id: string;
  readonly type: string;
  /** 番地。2 端子は 2 つ、1 端子・多端子は 1 つ。 */
  readonly at: readonly Address[];
  readonly value?: string;
};

/** 鍵の行 (1 始まり)。無ければ 0。 */
const keyLineOf = (lines: readonly string[], key: string): number =>
  lines.findIndex((text) => new RegExp(`^\\s*${key}\\s*:`).test(text)) + 1;

/** その鍵がフロー形式で書かれているか (鍵の行に中身まで載っている)。 */
const isFlow = (lines: readonly string[], key: string): boolean => {
  const line = keyLineOf(lines, key);
  return line > 0 && (lines[line - 1] ?? '').replace(new RegExp(`^\\s*${key}\\s*:`), '').trim() !== '';
};

/** その行 (1 始まり) の字下げ。足す行は**既にある行に合わせる**。無ければ空白 2 つ。 */
const indentOf = (lines: readonly string[], line: number): string =>
  (/^\s*/.exec(lines[line - 1] ?? '')?.[0] ?? '') || '  ';

/** 末尾の空行より前。鍵ごと足すときの行き先 (末尾の空行の後ろに書かない)。 */
const afterLast = (lines: readonly string[]): number => {
  const last = lines.map((text) => text.trim() !== '').lastIndexOf(true);
  return last < 0 ? 1 : last + 2;
};

const spell = (endpoint: Endpoint): string =>
  (endpoint.kind === 'cell' ? formatAddress(endpoint.address) : `${endpoint.part}.${endpoint.pin}`);

/** 足した行から書き換えを組み立て、前後のネットリストを比べる。 */
function addition(source: string, lines: readonly LineEdit[]): RewriteResult {
  const rewrite = { edits: [], lines, diff: { lost: [], gained: [] } };
  return { ok: true, value: { ...rewrite, diff: diffOf(source, applyRewrite(source, rewrite)) } };
}

const OFF_GRID = `格子の外へは置けません (a〜z の 26 行、1〜${LIMITS.columns} 列)`;

export function insertWire(
  source: string,
  from: Endpoint,
  to: Endpoint,
  operator: WireOperator = '--',
): RewriteResult {
  const normalized = normalizeNewlines(source);
  const { doc } = parseFence(normalized);
  if (!doc) return fail('フェンスを読めないので足せません (先にエラーを直します)', null);

  for (const end of [from, to]) {
    if (end.kind === 'cell') {
      if (!isOnGrid(end.address)) return fail(OFF_GRID, null);
      continue;
    }
    // 足は書ける名前かどうかを**置く前に**見る (書いてから帯で気づくのでは遅い)。
    const part = doc.parts.find((candidate) => candidate.id === end.part);
    if (!part) return fail(`部品が見つかりません: ${end.part}`, null);
    const type = lookupPartType(part.type);
    if (!type || lookupPin(type, end.pin) === null) {
      return fail(`${end.part} に ${end.pin} という足はありません`, part.line);
    }
  }

  const lines = normalized.split('\n');
  if (isFlow(lines, 'wires')) return fail('フロー形式 (1 行に書いた形) の配線には足せません。手で書きます', null);

  const key = keyLineOf(lines, 'wires');
  const last = doc.wires.reduce((deepest, wire) => Math.max(deepest, wire.line), 0);
  const written = `- ${spell(from)} ${operator} ${spell(to)}`;

  if (key === 0) {
    // 鍵ごと足す。**末尾の空行の前**に置く (フェンスの終わりに余りが残らない)。
    const at = afterLast(lines);
    return addition(normalized, [
      { kind: 'insert', line: at, text: 'wires:' },
      { kind: 'insert', line: at, text: `  ${written}` },
    ]);
  }

  return last > 0
    ? addition(normalized, [{ kind: 'insert', line: last + 1, text: `${indentOf(lines, last)}${written}` }])
    : addition(normalized, [{ kind: 'insert', line: key + 1, text: `  ${written}` }]);
}

export function insertPart(source: string, spec: NewPart): RewriteResult {
  const normalized = normalizeNewlines(source);
  const { doc } = parseFence(normalized);
  if (!doc) return fail('フェンスを読めないので足せません (先にエラーを直します)', null);

  if (!isReferenceable(spec.id)) {
    return fail(`部品 ID ${spec.id} は使えません (英数字と _ - だけの ${LIMITS.idLength} 文字まで)`, null);
  }
  if (doc.parts.some((part) => part.id === spec.id)) return fail(`部品 ID ${spec.id} はもう使われています`, null);
  if (doc.points.has(spec.id)) return fail(`${spec.id} は番地の名前として使われています`, null);

  const type = lookupPartType(spec.type);
  if (!type) return fail(`知らない部品の種類です: ${spec.type}`, null);

  const wanted = type.kind === 'two-terminal' ? 2 : 1;
  if (spec.at.length !== wanted) {
    return fail(`${spec.type} は番地を ${wanted} つ書きます (${spec.at.length} つ渡されました)`, null);
  }
  if (spec.at.some((address) => !isOnGrid(address))) return fail(OFF_GRID, null);

  const lines = normalized.split('\n');
  if (isFlow(lines, 'parts')) return fail('フロー形式 (1 行に書いた形) の部品には足せません。手で書きます', null);

  const written = [
    `${spec.id}:`,
    spec.type,
    ...spec.at.map(formatAddress),
    ...(spec.value === undefined ? [] : [spec.value]),
  ].join(' ');

  const key = keyLineOf(lines, 'parts');
  if (key === 0) {
    // **`parts:` は `wires:` より前に置く。** 読む順が図の順と揃う。
    const before = ['wires', 'notes', 'style'].map((one) => keyLineOf(lines, one)).filter((line) => line > 0);
    const at = before.length > 0 ? Math.min(...before) : afterLast(lines);
    return addition(normalized, [
      { kind: 'insert', line: at, text: 'parts:' },
      { kind: 'insert', line: at, text: `  ${written}` },
    ]);
  }

  const last = doc.parts.reduce((deepest, part) => Math.max(deepest, part.line), 0);
  return last > 0
    ? addition(normalized, [{ kind: 'insert', line: last + 1, text: `${indentOf(lines, last)}${written}` }])
    : addition(normalized, [{ kind: 'insert', line: key + 1, text: `  ${written}` }]);
}
