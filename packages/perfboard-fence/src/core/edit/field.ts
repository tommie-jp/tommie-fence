import { normalizeNewlines } from 'fence-kit';
import type { Edit, NetDiff } from 'fence-kit';
import { fenceError, safeToken } from '../errors.ts';
import { LIMITS } from '../limits.ts';
import { parseAddress } from '../model/address.ts';
import { parseFence } from '../parser/parseFence.ts';
import { footprintOf } from '../parts/footprint.ts';
import { isKnownType, placeableNames, splitPartType } from '../parts/types.ts';
import type { FenceError } from '../types.ts';
import { diffAfter } from './diff.ts';
import { locateTokens } from './shared.ts';

/**
 * 部品の欄 (種類・値) を書き換える。**1 部品 = 1 行**の文法なので、
 * 行の中のトークンの差し替えに落ちる。
 *
 * **ラベルの欄は無い。** この文法に `l=` にあたる綴りが無く、字を添えたいときは
 * 注釈 (`notes:`) で書く。書ける欄を返す `can` にもラベルは載せない。
 *
 * 名前 (`R1:`) だけは鍵と注釈の 2 か所に散るので別の道を通る (`rename.ts`)。
 */

export type PartField = 'type' | 'value';

/** 欄のいまの中身。**モデルから読む**ので、書いた綴りではなく読めた値が出る。 */
export type PartFields = {
  readonly id: string;
  readonly type: string;
  readonly value: string;
  /** この文法には無い。殻の形に合わせて空で返す。 */
  readonly label: string;
  /** 色は配線だけが持つ (部品の色は種類と値で決まる)。部品はいつも空。 */
  readonly color: string;
  /**
   * 書き換えられる欄。**フェンスが決める** — どの部品にどの欄があるかは
   * 種類の語彙の話で、殻の持ち物ではない。
   */
  readonly can: readonly PartField[];
};

export type FieldResult =
  | { readonly ok: true; readonly value: { readonly edits: readonly Edit[]; readonly diff: NetDiff } }
  | { readonly ok: false; readonly error: FenceError };

const fail = (message: string, line: number | null): FieldResult =>
  ({ ok: false, error: fenceError(message, line) });

/** 行末コメント。**中は書き換えない** (綴りが値に見えても値ではない)。 */
const COMMENT = /(^|\s)#/;

type Token = { readonly column: number; readonly length: number; readonly text: string };

/** 行の中の綴りを位置つきで。**コメントより後ろは見ない**。 */
function tokensOn(lineText: string): readonly Token[] {
  const comment = COMMENT.exec(lineText);
  const scanned = comment === null ? lineText : lineText.slice(0, comment.index);
  return [...scanned.matchAll(/\S+/g)].map((match) => ({
    column: match.index ?? 0,
    length: match[0].length,
    text: match[0],
  }));
}

type Layout = {
  readonly line: number;
  readonly text: string;
  readonly type: Token;
  /** 値の綴り (`100n 50V` のように空白を含む書き方をそのまま通す)。 */
  readonly value: readonly Token[];
};

/** その部品の行を、欄ごとに切り分ける。読めなければ null。 */
function layoutOf(source: string, id: string): Layout | null {
  const normalized = normalizeNewlines(source);
  const { doc } = parseFence(normalized);
  if (doc === null) return null;

  const part = doc.parts.find((one) => one.id === id);
  const line = part?.line ?? null;
  const text = line === null ? undefined : normalized.split('\n')[line - 1];
  if (part === undefined || line === null || text === undefined) return null;

  const resolved = new Map<string, NonNullable<ReturnType<typeof parseAddress>>>();
  for (const point of doc.points) {
    const address = parseAddress(point.written);
    if (address !== null) resolved.set(point.name, address);
  }
  const holes = part.holes.map((hole) => parseAddress(hole) ?? resolved.get(hole) ?? null)
    .filter((one) => one !== null);

  const located = locateTokens(text, holes, resolved);
  const holeColumns = new Set((located?.tokens ?? []).map((token) => token.column));

  const tokens = tokensOn(text);
  // 鍵 (`R1:`) の次が種類。**鍵は書き換えない** (改名は別の道)。
  const keyAt = tokens.findIndex((token) => token.text.endsWith(':'));
  const after = tokens.slice(keyAt + 1);
  const type = after[0];
  if (type === undefined) return null;

  const value = after.slice(1).filter((token) => !holeColumns.has(token.column));

  return { line, text, type, value };
}

/** その部品の欄のいまの中身。無ければ null。 */
export function partFields(source: string, id: string): PartFields | null {
  const { doc } = parseFence(normalizeNewlines(source));
  const part = doc?.parts.find((one) => one.id === id);
  if (part === undefined) return null;

  return {
    id: part.id,
    type: part.written,
    value: part.value ?? '',
    label: '',
    color: '',
    // **ラベルの欄はこの文法に無い。** 字を添えたいときは注釈で書く。
    can: ['type', 'value'],
  };
}

/** 値とラベルに書ける字か。**行の形を壊す字は通さない**。 */
const badText = (text: string): string | null => {
  if (text.includes('#')) return 'YAML のコメントになるので `#` は書けません';
  if (/[:{}[\],]/.test(text)) return 'YAML の記号 (`:` `{` `}` `[` `]` `,`) は書けません';
  if ([...text].length > LIMITS.labelLength) return `${LIMITS.labelLength} 文字までです`;
  return null;
};

export function setField(source: string, id: string, field: PartField, text: string): FieldResult {
  const layout = layoutOf(source, id);
  if (layout === null) return fail(`部品の行を読めません: ${safeToken(id)}`, null);

  const written = text.trim();
  if (field !== 'type') {
    const problem = badText(written);
    if (problem !== null) return fail(`${safeToken(id)} の値: ${problem}`, layout.line);
  }

  const edits: Edit[] = [];
  if (field === 'type') {
    if (written === '') return fail('種類は空にできません', layout.line);
    const { type, variant, problem } = splitPartType(written);
    if (problem !== null) return fail(`${safeToken(id)}: ${problem}`, layout.line);
    // **置く前に種類を確かめる。** 書いてから帯で気づくのでは遅い。
    // 知らないのか、知っているが置けないのかで、次にやることが違う。
    if (footprintOf(type, variant) === null) {
      return fail(
        isKnownType(type)
          ? `${safeToken(written)} はまだ置けません`
          : `知らない部品の種類です: ${safeToken(written)} (${placeableNames().slice(0, 6).join(' / ')} など)`,
        layout.line,
      );
    }
    // **足の数が変わる種類には替えない。** 穴の数が合わなくなると図が消える。
    const now = splitPartType(layout.type.text);
    const before = footprintOf(now.type, now.variant);
    const after = footprintOf(type, variant);
    if (before !== null && after !== null && before.holes !== after.holes) {
      return fail(
        `${safeToken(written)} は穴を ${after.holes} つ書く種類です (${safeToken(layout.type.text)} は ${before.holes} つ)`,
        layout.line,
      );
    }
    if (written === layout.type.text) return { ok: true, value: { edits: [], diff: { lost: [], gained: [] } } };
    edits.push({ line: layout.line, column: layout.type.column, length: layout.type.length, text: written });
  } else {
    const first = layout.value[0];
    const last = layout.value[layout.value.length - 1];
    if (first !== undefined && last !== undefined) {
      const from = written === '' ? first.column - 1 : first.column;
      edits.push({ line: layout.line, column: from, length: last.column + last.length - from, text: written });
    } else if (written !== '') {
      // 値が無い行へ足す。**行末** (書く順は 種類 穴 値)。
      edits.push({ line: layout.line, column: layout.text.trimEnd().length, length: 0, text: ` ${written}` });
    }
  }

  return { ok: true, value: { edits, diff: diffAfter(source, edits) } };
}
