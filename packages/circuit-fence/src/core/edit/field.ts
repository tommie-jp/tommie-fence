import { LIMITS } from '../limits.ts';
import type { PartSpec } from '../types.ts';
import { normalizeNewlines } from '../newlines.ts';
import { ORIENTATIONS } from '../parser/compact.ts';
import { parseFence } from '../parser/parseFence.ts';
import { lookupPartType } from '../parts.ts';
import { applyRewrite, diffOf, fail, keySpanOf, locatePart } from './shared.ts';
import type { Edit, RewriteResult } from './shared.ts';

/**
 * 部品の欄 (種類・値・ラベル) を書き換える。**フェンス本文 → 書き換えの並び**を
 * 返す純関数で、vscode を知らない (設計上の約束 1)。
 *
 * **1 部品 = 1 行の文法なので、欄の編集は行の中のトークン差し替えに落ちる。**
 * 名前・値・種類・ラベルを別々の機能にしない (インスペクタは 1 行の入力欄)。
 * 名前だけは 3 か所に散るので別 (`rename.ts`)。
 *
 * 空の字を渡すと**その欄を消す** (値やラベルは書かなくてよい)。種類は消せない。
 * フロー形式 (`parts: {…}`) は行が部品 1 つに対応しないので断る。
 */

export type PartField = 'type' | 'value' | 'label';

/** 欄に出す、いまの中身。**書き換えと同じ読み方**を通す (食い違わない)。 */
export type PartFields = {
  readonly id: string;
  readonly type: string;
  /** 端子の数。欄に出せるものが変わる (1 端子は値もラベルも書けない)。 */
  readonly kind: PartSpec['kind'];
  readonly value: string;
  readonly label: string;
};

/**
 * その部品の欄のいまの中身。**モデルから読む**ので、書いた綴りではなく
 * 読めた値が出る (`l=R_1` の `R_1`)。無い欄は空文字。
 */
export function partFields(source: string, partId: string): PartFields | null {
  const { doc } = parseFence(normalizeNewlines(source));
  const part = doc?.parts.find((candidate) => candidate.id === partId);
  if (part === undefined) return null;

  return {
    id: part.id,
    type: part.type,
    kind: part.kind,
    value: (part.kind === 'one-terminal' ? null : part.value) ?? '',
    label: (part.kind === 'two-terminal' ? part.label : null) ?? '',
  };
}

/** 行末コメントを落とした行 (`#` は行頭か空白の直後だけコメント)。 */
const uncommented = (text: string): string => {
  const comment = /(^|\s)#/.exec(text);
  return comment === null ? text : text.slice(0, comment.index);
};

type Token = { readonly column: number; readonly text: string };

const tokensFrom = (text: string, at: number): readonly Token[] =>
  [...uncommented(text).matchAll(/\S+/g)]
    .map((match) => ({ column: match.index ?? 0, text: match[0] }))
    .filter((token) => token.column >= at);

/** 欄 1 つを書き換える編集。無い欄は足し、空の字なら消す。 */
function editFor(line: number, found: Token | null, text: string, append: number): readonly Edit[] {
  if (found === null) {
    return text === '' ? [] : [{ line, column: append, length: 0, text: ` ${text}` }];
  }
  return text === ''
    // 前の空白ごと消す (消したあとに空白が 2 つ残らない)。
    ? [{ line, column: found.column - 1, length: found.text.length + 1, text: '' }]
    : [{ line, column: found.column, length: found.text.length, text }];
}

const WHITESPACE = /\s/;

/**
 * 欄に書ける字か。書けないなら理由、書けるなら null。
 *
 * **`#` を断るのが要**。`R1: resistor a1 a3 #hi` と書けてしまうと、YAML は
 * そこから後ろをコメントとして読むので、**値が黙って消える** — エラーも
 * ネットの差分も出ないので、書いた人は書けたつもりのまま終わる。
 *
 * 部品を足すとき (`insert.ts`) も同じ関所を通す。別々に持つと、片方だけが
 * 通してしまう。
 */
export function fieldProblem(text: string): string | null {
  if (text === '') return null;
  if (WHITESPACE.test(text)) return '空白を含む字は書けません (1 綴りで書きます)';
  if (text.includes('#')) return '# を含む字は書けません (そこから後ろがコメントとして消えます)';
  if (text.includes('=')) return '= を含む字は書けません (l= の札と紛れます)';
  if ([...text].length > LIMITS.valueLength) return `長すぎます (${LIMITS.valueLength} 文字まで)`;
  return null;
}

export function setField(source: string, partId: string, field: PartField, text: string): RewriteResult {
  const normalized = normalizeNewlines(source);
  const { doc } = parseFence(normalized);
  if (!doc) return fail('フェンスを読めないので書き換えられません (先にエラーを直します)', null);

  const part = doc.parts.find((candidate) => candidate.id === partId);
  if (!part) return fail(`部品が見つかりません: ${partId}`, null);

  const lines = normalized.split('\n');
  const shares = doc.parts.some((other) => other.line === part.line && other.id !== partId);
  if (shares || /^\s*parts\s*:/.test(lines[part.line - 1] ?? '')) {
    return fail(`${partId}: フロー形式 (1 行に書いた形) の部品は欄を足せません。手で書きます`, part.line);
  }
  const problem = fieldProblem(text);
  if (problem !== null) return fail(problem, part.line);

  const located = locatePart(doc, lines, partId);
  const lineText = lines[part.line - 1];
  if (located === null || lineText === undefined) {
    return fail(`${partId} の行から番地を見つけられませんでした`, part.line);
  }

  const last = located.tokens.at(-1);
  const after = last === undefined ? 0 : last.column + last.length;
  const found = fieldEdits({ part, field, text, lineText, tail: tokensFrom(lineText, after), after });
  if (!found.ok) return found;

  const rewrite = { edits: found.edits, lines: [], diff: { lost: [], gained: [] } };
  return { ok: true, value: { ...rewrite, diff: diffOf(normalized, applyRewrite(normalized, rewrite)) } };
}

type Context = {
  readonly part: PartSpec;
  readonly field: PartField;
  readonly text: string;
  readonly lineText: string;
  readonly tail: readonly Token[];
  readonly after: number;
};

type Found = { readonly ok: true; readonly edits: readonly Edit[] } | ReturnType<typeof fail>;

const found = (edits: readonly Edit[]): Found => ({ ok: true, edits });

/** 欄ごとの探し方と足す場所。断るときは `fail` の結果をそのまま返す。 */
function fieldEdits(context: Context): Found {
  const { part, field, text, lineText, tail, after } = context;
  const line = part.line;

  if (field === 'type') {
    if (text === '') return fail('種類は消せません', line);
    const type = lookupPartType(text);
    if (!type) return fail(`知らない部品の種類です: ${text}`, line);
    if (type.kind !== part.kind) {
      return fail(`${text} は番地の数が違うので、そのままでは差し替えられません`, line);
    }
    const key = keySpanOf(lineText, part.id, 0);
    const at = key === null ? 0 : key.column + key.length + 1;
    const written = tokensFrom(lineText, at)[0];
    if (written === undefined) return fail(`${part.id} の種類を書いている場所が見つかりませんでした`, line);
    return found([{ line, column: written.column, length: written.text.length, text }]);
  }

  if (field === 'label') {
    if (part.kind !== 'two-terminal') {
      return fail(`${part.id} には l= を書けません (2 端子の部品だけ)`, line);
    }
    const written = tail.find((token) => token.text.startsWith('l=')) ?? null;
    // ラベルは値のうしろに足す (書く順の慣習に合わせる)。
    const end = tail.at(-1);
    const append = end === undefined ? after : end.column + end.text.length;
    return found(editFor(line, written, text === '' ? '' : `l=${text}`, append));
  }

  if (part.kind === 'one-terminal') return fail(`${part.id} には値を書けません (「種類 番地」だけ)`, line);
  if (text.includes('=')) return fail('値に = は書けません (札と紛れます)', line);
  if (part.kind === 'two-terminal' && part.voltage !== null && text !== '') {
    return fail('v= の字と値は図の同じ側に出ます (どちらか片方にします)', line);
  }

  // 値は番地の次に書く綴り。札 (`l=`) と、多端子の向き (`+up`) は値ではない。
  const written = tail.find((token) => (
    !token.text.includes('=') && !(ORIENTATIONS as readonly string[]).includes(token.text)
  )) ?? null;
  return found(editFor(line, written, text, after));
}
