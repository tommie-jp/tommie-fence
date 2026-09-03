import { formatAddress } from '../model/address.ts';
import type { Address, WireOperator } from '../model/address.ts';
import { isReferenceable, LIMITS } from '../limits.ts';
import { normalizeNewlines } from '../newlines.ts';
import { lookupPartType, lookupPin, namesNet, PART_PREFIXES } from '../parts.ts';
import type { PartTypeName } from '../parts.ts';
import { parseFence } from '../parser/parseFence.ts';
import { fieldProblem } from './field.ts';
import type { Endpoint } from '../types.ts';
import { diffOf, fail, isOnGrid } from './shared.ts';
import { flipPart, turnPart } from './turn.ts';
import { handleAt } from './handles.ts';
import type { LineEdit, RewriteResult } from './shared.ts';
import { applyRewrite, orientInserted } from 'fence-kit';

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
  /**
   * 番地。2 端子は 2 つ、1 端子・多端子は 1 つ。**2 端子に 1 つだけ来たら、
   * もう一方は右へ既定の間隔** (マップの 1 クリック。ドラッグなら 2 つ来る)。
   */
  readonly at: readonly Address[];
  readonly value?: string;
  /** 置く前に回す (90 度を何回。正が時計回り) ・反転する。ゴーストの向きのまま書く。 */
  readonly turn?: number;
  readonly flip?: boolean;
  /** ゴーストの試し当て。**接続の変化を数えない** (捨てるので。fence-kit の `Trial`)。 */
  readonly preview?: boolean;
};

/**
 * 2 端子を 1 番地で置くときの、もう一方までの距離 (升の数)。examples では
 * 1 升と 2 升が拮抗している (61 件 / 55 件) が、1 升だと記号の胴が足に食われるので 2 にする。
 */
const DEFAULT_SPAN = 2;

/**
 * 置いた行を、置く前に回す・反転する。段取りは fence-kit の `orientInserted` —
 * **回す側の関数をそのまま通す**ので、置いてから回したのと同じ行になる。
 *
 * 名札と行は**読み直して**取る。同じ名前を何度でも置ける文法なので
 * (`VCC` は何か所にあっても同じ節点)、指すのは**その名前の最後の部品** —
 * 足した行は末尾に付く。行の頭の綴りで探すと `points:` の同名を掴む。
 */
function oriented(source: string, spec: NewPart, added: readonly LineEdit[]): RewriteResult {
  /** 置いた部品の名札と行番号。読み直せなければ null。 */
  const placedPart = (placed: string): { readonly handle: string; readonly line: number } | null => {
    const parts = parseFence(placed).doc?.parts ?? [];
    const index = parts.map((part) => part.id).lastIndexOf(spec.id);
    const part = parts[index];
    return part === undefined ? null : { handle: handleAt(parts, index), line: part.line };
  };

  const result = orientInserted(source, added, spec, {
    turn: (placed, quarters) => turnPart(placed, placedPart(placed)?.handle ?? spec.id, quarters),
    flip: (placed) => flipPart(placed, placedPart(placed)?.handle ?? spec.id),
    lineOf: (placed) => {
      const at = placedPart(placed)?.line;
      return at === undefined ? null : placed.split('\n')[at - 1] ?? null;
    },
  });
  return result.ok ? addition(source, result.lines, spec.preview === true) : { ok: false, error: result.error };
}

/** 鍵の行 (1 始まり)。無ければ 0。 */
const keyLineOf = (lines: readonly string[], key: string): number =>
  lines.findIndex((text) => new RegExp(`^\\s*${key}\\s*:`).test(text)) + 1;

/** その鍵がフロー形式で書かれているか (鍵の行に中身まで載っている)。 */
const isFlow = (lines: readonly string[], key: string): boolean => {
  const line = keyLineOf(lines, key);
  return line > 0 && (lines[line - 1] ?? '').replace(new RegExp(`^\\s*${key}\\s*:`), '').trim() !== '';
};

/**
 * その行 (1 始まり) の字下げ。足す行は**既にある行に合わせる**。
 *
 * **0 桁は「字下げが無い」ではない。** YAML の並びは列 0 にも書けるので、
 * そこへ 2 つ空けて足すと、足した行が前の値に畳み込まれてフェンスが読めなくなる
 * (図がまるごと消える)。行そのものが無いときだけ 2 つにする。
 */
const indentOf = (lines: readonly string[], line: number): string => {
  const text = lines[line - 1];
  if (text === undefined) return '  ';
  return /^\s*/.exec(text)?.[0] ?? '';
};

/** 末尾の空行より前。鍵ごと足すときの行き先 (末尾の空行の後ろに書かない)。 */
const afterLast = (lines: readonly string[]): number => {
  const last = lines.map((text) => text.trim() !== '').lastIndexOf(true);
  return last < 0 ? 1 : last + 2;
};

const spell = (endpoint: Endpoint): string =>
  (endpoint.kind === 'cell' ? formatAddress(endpoint.address) : `${endpoint.part}.${endpoint.pin}`);

/**
 * 足した行から書き換えを組み立て、前後のネットリストを比べる。
 * **試し当て (ゴースト) では比べない** — 捨てる値のために図を 2 枚組み直さない。
 */
function addition(source: string, lines: readonly LineEdit[], trial = false): RewriteResult {
  const rewrite = { edits: [], lines, diff: { lost: [], gained: [] } };
  return trial
    ? { ok: true, value: rewrite }
    : { ok: true, value: { ...rewrite, diff: diffOf(source, applyRewrite(source, rewrite)) } };
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

  // 長さ 0 の線は図に出ない (押し間違いでしか生まれない)。
  if (from.kind === 'cell' && to.kind === 'cell' && formatAddress(from.address) === formatAddress(to.address)) {
    return fail(`両端が同じ番地です (${formatAddress(from.address)})`, null);
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
  // **同じ名前を名乗れる記号は重ねて置ける** (`port` / `vcc` / `vee`)。
  // `VCC` を何か所にも描くのは回路図の書き方そのもので、名前が同じなら
  // 同じ節点として数える (`model/nets.ts`)。
  const repeatable = namesNet(spec.type)
    && doc.parts.every((part) => part.id !== spec.id || namesNet(part.type));
  if (!repeatable && doc.parts.some((part) => part.id === spec.id)) {
    return fail(`部品 ID ${spec.id} はもう使われています`, null);
  }
  if (doc.points.has(spec.id)) return fail(`${spec.id} は番地の名前として使われています`, null);

  const type = lookupPartType(spec.type);
  if (!type) return fail(`知らない部品の種類です: ${spec.type}`, null);

  const wanted = type.kind === 'two-terminal' ? 2 : 1;
  const anchor = spec.at[0];
  // **2 端子に番地 1 つなら、もう一方は右へ既定の間隔** (マップの 1 クリック)。
  const at = wanted === 2 && spec.at.length === 1 && anchor !== undefined
    ? [anchor, { row: anchor.row, col: anchor.col + DEFAULT_SPAN }]
    : spec.at;
  if (at.length !== wanted) {
    return fail(`${spec.type} は番地を ${wanted} つ書きます (${at.length} つ渡されました)`, null);
  }
  if (at.some((address) => !isOnGrid(address))) return fail(OFF_GRID, null);

  const lines = normalized.split('\n');
  if (isFlow(lines, 'parts')) return fail('フロー形式 (1 行に書いた形) の部品には足せません。手で書きます', null);

  // **値は `setField` と同じ関所を通す。** ここだけ素通しにすると、
  // 空白で行が壊れ、`#` で値が黙って消え、`l=` が札になる。
  if (spec.value !== undefined) {
    const problem = fieldProblem(spec.value);
    if (problem !== null) return fail(problem, null);
  }

  const written = [
    `${spec.id}:`,
    spec.type,
    ...at.map(formatAddress),
    ...(spec.value === undefined ? [] : [spec.value]),
  ].join(' ');

  const key = keyLineOf(lines, 'parts');
  if (key === 0) {
    // **`parts:` は `wires:` より前に置く。** 読む順が図の順と揃う。
    const before = ['wires', 'notes', 'style'].map((one) => keyLineOf(lines, one)).filter((line) => line > 0);
    const where = before.length > 0 ? Math.min(...before) : afterLast(lines);
    return oriented(normalized, spec, [
      { kind: 'insert', line: where, text: 'parts:' },
      { kind: 'insert', line: where, text: `  ${written}` },
    ]);
  }

  const last = doc.parts.reduce((deepest, part) => Math.max(deepest, part.line), 0);
  return last > 0
    ? oriented(normalized, spec, [{ kind: 'insert', line: last + 1, text: `${indentOf(lines, last)}${written}` }])
    : oriented(normalized, spec, [{ kind: 'insert', line: key + 1, text: `  ${written}` }]);
}

/**
 * ID がそのままネットの名前になる種類の、既定の名前。**どれも `namesNet`** なので、
 * 同じ名前を何度でも置ける (`VCC` は何か所にあっても同じ節点)。
 */
const NET_NAMES: Readonly<Record<string, string>> = { port: 'IN', vcc: 'VCC', vee: 'VEE' };

/**
 * 置く部品に付ける ID。**接頭辞ごとに最小の未使用番号** (`P1` が lamp なら
 * potentiometer は `P2`。docs の例がそう書いている)。
 *
 * `null` を返すのは 2 つのとき — 種類を知らない、フェンスを読めない。
 * ID がそのままネットの名前になる種類 (`port` / `vcc` / `vee`) は
 * **既定の名前で置く** (KiCad が `#PWR?` で置いてから直させるのと同じ)。
 */
export function nextPartId(source: string, type: string): string | null {
  const { doc } = parseFence(normalizeNewlines(source));
  if (!doc) return null;
  const used = new Set(doc.parts.map((part) => part.id));

  // **自分の持ち物だけを引く。** 素の添字だと `constructor` が Object.prototype から
  // 拾えて、名前として関数が返る (同じ理由で `lookupPartType` も `hasOwn` を使う)。
  const named = Object.hasOwn(NET_NAMES, type) ? NET_NAMES[type] : undefined;
  if (named !== undefined) {
    // **既定の名前で置く** (置く流れを窓で止めない。名前は欄で直す)。
    // `VCC` / `VEE` は何か所にあっても同じ節点なのでそのまま。`port` は
    // 別々の信号が普通なので、使われていれば番号を足す (`IN` → `IN2`)。
    if (type !== 'port') return named;
    if (!used.has(named)) return named;
    for (let number = 2; number <= LIMITS.parts + 1; number += 1) {
      if (!used.has(`${named}${number}`)) return `${named}${number}`;
    }
    return null;
  }

  const prefix = PART_PREFIXES[type as PartTypeName] ?? null;
  if (prefix === null) return null;
  for (let number = 1; number <= LIMITS.parts + 1; number += 1) {
    const id = `${prefix}${number}`;
    if (!used.has(id)) return id;
  }
  return null;
}


