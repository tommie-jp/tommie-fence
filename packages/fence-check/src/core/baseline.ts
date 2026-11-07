import { KINDS } from './check.ts';
import type { Kind } from './check.ts';
import type { FindingRow } from './report.ts';

/**
 * 基準 (baseline) との突き合わせ (52 の docs/150)。
 *
 * 棚卸しの時点の件を「知っている崩れ」として 1 つのファイルに写し、以後は**基準に無い件だけ**を
 * 出す。閾値を決めずに「崩れを増やさない」を赤くできる。基準は `--write` で**減るだけ**で、
 * わざと残す新しい件は理由つきの許す一覧 (allow) に書く (基準に足す口を作らない)。
 *
 * 件の同じさは鍵 (`keyOf`) で見る。行番号と量は鍵に入れない — 題を 1 段落足すと下の全部の
 * 行がずれ、描画を直すたびに量は 1〜2 px 動く。同じ鍵の件が 2 つある (同じ 2 本の線が
 * 2 か所で交わる) ことがあるので、鍵ごとの**件数**で突き合わせる。
 */

/** 許す一覧の 1 件。鍵の欄と理由。 */
export type AllowEntry = Pick<FindingRow, 'file' | 'title' | 'sheet' | 'kind' | 'a' | 'b'> & { readonly reason: string };

export type BaselineDiff = {
  /** 基準にも許す一覧にも無い、確かな件。1 件でもあれば赤くする。 */
  readonly fresh: readonly FindingRow[];
  /** 基準に無い近似の件 (`uncertain`)。出すだけで赤くしない。 */
  readonly freshUncertain: readonly FindingRow[];
  readonly known: readonly FindingRow[];
  readonly allowed: readonly FindingRow[];
  /** 基準にあって今は無い件 (直った)。`--write` で基準から消える。 */
  readonly resolved: readonly FindingRow[];
};

type KeyFields = Pick<FindingRow, 'file' | 'title' | 'sheet' | 'kind' | 'a' | 'b'>;

export const keyOf = (row: KeyFields): string =>
  [row.file, row.title ?? '', row.sheet ?? '', row.kind, row.a, row.b].join('\t');

const countKeys = (rows: readonly KeyFields[]): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(keyOf(row), (counts.get(keyOf(row)) ?? 0) + 1);
  return counts;
};

export function diffBaseline(
  current: readonly FindingRow[],
  baseline: readonly FindingRow[],
  allow: readonly AllowEntry[],
): BaselineDiff {
  const left = countKeys(baseline);
  const allowedKeys = new Set(allow.map(keyOf));
  const known: FindingRow[] = [];
  const allowed: FindingRow[] = [];
  const fresh: FindingRow[] = [];
  const freshUncertain: FindingRow[] = [];
  for (const row of current) {
    const key = keyOf(row);
    const remaining = left.get(key) ?? 0;
    if (remaining > 0) {
      left.set(key, remaining - 1);
      known.push(row);
    } else if (allowedKeys.has(key)) {
      allowed.push(row);
    } else if (row.grade === 'uncertain') {
      freshUncertain.push(row);
    } else {
      fresh.push(row);
    }
  }
  // 残った数だけ、基準の後ろから「直った」に数える (同じ鍵のどれが消えたかは区別できない)。
  const resolved = [...baseline].reverse().filter((row) => {
    const remaining = left.get(keyOf(row)) ?? 0;
    if (remaining === 0) return false;
    left.set(keyOf(row), remaining - 1);
    return true;
  }).reverse();
  return { fresh, freshUncertain, known, allowed, resolved };
}

const byKey = (a: FindingRow, b: FindingRow): number =>
  keyOf(a) < keyOf(b) ? -1 : keyOf(a) > keyOf(b) ? 1 : a.line - b.line;

/**
 * 減らした基準。鍵が基準にある**今の行** (行番号と量は今のもの — VS Code で開ける) を、
 * 鍵ごとに基準の件数まで、鍵の順に。**基準に無い鍵は足さない。**
 */
export function shrunkBaseline(current: readonly FindingRow[], baseline: readonly FindingRow[]): readonly FindingRow[] {
  const left = countKeys(baseline);
  return current.filter((row) => {
    const remaining = left.get(keyOf(row)) ?? 0;
    if (remaining === 0) return false;
    left.set(keyOf(row), remaining - 1);
    return true;
  }).sort(byKey);
}

export type ReadResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly message: string };

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isNullableString = (value: unknown): value is string | null => value === null || typeof value === 'string';
const isKind = (value: unknown): value is Kind => (KINDS as readonly unknown[]).includes(value);

/** 鍵の欄がそろっているか。そろっていなければ何が悪いかを返す。 */
function keyProblem(entry: Readonly<Record<string, unknown>>): string | null {
  if (typeof entry.file !== 'string') return 'file が文字列ではありません';
  if (!isNullableString(entry.title)) return 'title が文字列か null ではありません';
  if (!isNullableString(entry.sheet)) return 'sheet が文字列か null ではありません';
  if (!isKind(entry.kind)) return `kind が ${KINDS.join(' / ')} のどれでもありません`;
  if (typeof entry.a !== 'string' || typeof entry.b !== 'string') return 'a と b が文字列ではありません';
  return null;
}

/** 基準のファイル (`--json` の出力そのまま) から `findings` を読む。 */
export function readBaselineRows(json: unknown): ReadResult<readonly FindingRow[]> {
  if (!isRecord(json) || !Array.isArray(json.findings)) return { ok: false, message: 'findings の配列がありません' };
  for (const [index, entry] of json.findings.entries()) {
    const problem = isRecord(entry) ? keyProblem(entry) : 'オブジェクトではありません';
    if (problem !== null) return { ok: false, message: `findings の ${index + 1} 件め: ${problem}` };
  }
  return { ok: true, value: json.findings as readonly FindingRow[] };
}

/** 許す一覧 (`{ "allow": [{ file, title, sheet, kind, a, b, reason }] }`) を読む。理由は必須。 */
export function readAllowList(json: unknown): ReadResult<readonly AllowEntry[]> {
  if (!isRecord(json) || !Array.isArray(json.allow)) return { ok: false, message: 'allow の配列がありません' };
  for (const [index, entry] of json.allow.entries()) {
    const problem = !isRecord(entry)
      ? 'オブジェクトではありません'
      : keyProblem(entry) ?? (typeof entry.reason === 'string' && entry.reason.trim() !== '' ? null : 'reason (許す理由) がありません');
    if (problem !== null) return { ok: false, message: `allow の ${index + 1} 件め: ${problem}` };
  }
  return { ok: true, value: json.allow as readonly AllowEntry[] };
}

/** 件を 1 件 1 行の JSON に。`git diff` がそのまま件の増減として読める。 */
export const formatFindingsJson = (rows: readonly FindingRow[]): string =>
  rows.length === 0
    ? '{ "findings": [] }\n'
    : `{ "findings": [\n${rows.map((row) => `  ${JSON.stringify(row)}`).join(',\n')}\n] }\n`;

export function formatBaselineSummary(diff: BaselineDiff): string {
  const before = diff.known.length + diff.resolved.length;
  const resolved = diff.resolved.length === 0 ? '' : ` (resolved ${diff.resolved.length}: --write で基準から消せる)`;
  return `baseline ${before} → ${diff.known.length}${resolved} / new ${diff.fresh.length} / allowed ${diff.allowed.length} / uncertain-new ${diff.freshUncertain.length}`;
}
