import { LIMITS } from '../limits.ts';
import type { PartSpec } from '../types.ts';
import { normalizeNewlines } from '../newlines.ts';
import { nameOfHandle, partOfHandle } from './handles.ts';
import { parseFence } from '../parser/parseFence.ts';
import { lookupPartType, resolvePartTypeName } from '../parts.ts';
import { dressLine, lineEdits } from 'fence-kit';
import { spellPart } from '../write/spellPart.ts';
import { writeFence } from '../write/writeFence.ts';
import { applyRewrite, diffOf, entryOfPart, fail } from './shared.ts';
import type { RewriteResult } from './shared.ts';

/**
 * 部品の欄 (種類・値・ラベル) を書き換える。**フェンス本文 → 書き換えの並び**を
 * 返す純関数で、vscode を知らない (設計上の約束 1)。
 *
 * **1 部品 = 1 行の文法なので、欄の編集は行の中のトークン差し替えに落ちる。**
 * 名前・値・種類・ラベルを別々の機能にしない (インスペクタは 1 行の入力欄)。
 * 名前だけは 3 か所に散るので別 (`rename.ts`)。
 *
 * 空の字を渡すと**その欄を消す** (値やラベルは書かなくてよい)。種類は消せない。
 * フロー形式 (`parts: {…}`) は行が部品 1 つに対応しないので、その部品の範囲だけを
 * 書き換える (範囲の決め方は fence-kit の `entryOf`。3 つのフェンスで同じ)。
 */

export type PartField = 'id' | 'type' | 'value' | 'label';

/** 欄に出す、いまの中身。**書き換えと同じ読み方**を通す (食い違わない)。 */
export type PartFields = {
  readonly id: string;
  readonly type: string;
  readonly value: string;
  readonly label: string;
  /** 色。**回路図の配線に色は書けない**ので、いつも空。 */
  readonly color: string;
  /**
   * 書ける欄。**端子の数で決まる** (1 端子は値もラベルも書けない、
   * ラベルは 2 端子だけ)。殻へは種類の語ではなくこの一覧を渡す —
   * `one-terminal` のような circuit の語を、ほかのフェンスにも持ち込ませない。
   *
   * ここに `value` が載っていても、`v=` が書かれていれば書き換えは断られる
   * (図の同じ側に出るので並べられない)。その兼ね合いは行を見ないと決まらない。
   */
  readonly can: readonly PartField[];
};

/** その部品に書ける欄。 */
const fieldsFor = (kind: PartSpec['kind']): readonly PartField[] => [
  // 名前を直せる印。**種類と別に持つ** — 配線は種類を直せるが名前は無い。
  'id',
  'type',
  ...(kind === 'one-terminal' ? [] : ['value' as const]),
  ...(kind === 'two-terminal' ? ['label' as const] : []),
];

/**
 * その部品の欄のいまの中身。**モデルから読む**ので、書いた綴りではなく
 * 読めた値が出る (`l=R_1` の `R_1`)。無い欄は空文字。
 */
export function partFields(source: string, handle: string): PartFields | null {
  const { doc } = parseFence(normalizeNewlines(source));
  const part = partOfHandle(doc.parts, handle);
  if (part === null) return null;

  return {
    id: part.id,
    type: part.type,
    value: (part.kind === 'one-terminal' ? null : part.value) ?? '',
    label: (part.kind === 'two-terminal' ? part.label : null) ?? '',
    color: '',
    can: fieldsFor(part.kind),
  };
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

export function setField(source: string, handle: string, field: PartField, text: string): RewriteResult {
  const normalized = normalizeNewlines(source);
  const { doc } = parseFence(normalized);

  const part = partOfHandle(doc.parts, handle);
  const partId = nameOfHandle(handle);
  if (!part) return fail(`部品が見つかりません: ${partId}`, null);

  const lines = normalized.split('\n');
  const written = lines[part.line - 1] ?? '';
  // 鍵を見つけられない行 (`R1 : …` と書いた形) は、いままでどおり行ごと組み直す。
  // 1 行に部品が並んでいるときだけは範囲が決まらないので断る。
  const entry = entryOfPart(doc.parts, lines, part);
  const shares = doc.parts.some((other) => other.line === part.line && other !== part);
  if (entry === null && shares) return fail(`${partId} の行から部品の書き出しを見つけられませんでした`, part.line);
  const problem = fieldProblem(text) ?? (entry?.flow === true ? flowProblem(text) : null);
  if (problem !== null) return fail(problem, part.line);

  const changed = withField(part, field, text);
  if (!changed.ok) return changed;

  // **中身を直して、その行だけ組み直す** (52 の docs/54 の段 3)。書かれた字下げ・
  // 語の間の空白・コメントは `writeFence` が残すので、いまの当て方と同じ字になる
  // (`write/parity.test.ts` が見張る)。差し替えは違う所だけに絞る。
  // **1 行に並べた形はその部品の範囲だけ組み直す** — 行まるごとだと隣の部品を消す。
  const parts = doc.parts.map((one) => (one === part ? changed.part : one));
  const next = entry?.flow === true
    ? `${written.slice(0, entry.start)}${dressLine(written.slice(entry.start, entry.end), spellPart(changed.part))}${written.slice(entry.end)}`
    : writeFence(normalized, { ...doc, parts }, new Set([part.line]))[part.line - 1];
  const edits = next === undefined ? [] : lineEdits(part.line, written, next);

  const rewrite = { edits, lines: [], diff: { lost: [], gained: [] } };
  return { ok: true, value: { ...rewrite, diff: diffOf(normalized, applyRewrite(normalized, rewrite)) } };
}

/**
 * 1 行に並べた形 (`{R1: …, R2: …}`) で値に書けない字。書くとその場で項目が割れる。
 * ブロック形式の行では `1,000` の `,` もただの字なので、並べた形のときだけ断る。
 */
const flowProblem = (text: string): string | null =>
  /[,[\]{}]/.test(text) ? '1 行に並べた部品には , [ ] { } を書けません (そこで区切りと読まれます)' : null;

type Changed = { readonly ok: true; readonly part: PartSpec } | ReturnType<typeof fail>;

/**
 * 欄を直した部品。**断りの規則はいままでと同じ** — 種類は消せない・番地の数が
 * 違う種類へは替えない、`l=` は 2 端子だけ、1 端子に値は無い、値に `=` は
 * 書けない、`v=` と値は同じ側に出るので片方だけ。
 */
function withField(part: PartSpec, field: PartField, text: string): Changed {
  const line = part.line;

  if (field === 'type') {
    if (text === '') return fail('種類は消せません', line);
    const type = lookupPartType(text);
    if (!type) return fail(`知らない部品の種類です: ${text}`, line);
    if (type.kind !== part.kind) {
      return fail(`${text} は番地の数が違うので、そのままでは差し替えられません`, line);
    }
    // 書かれた綴り (`written`) を差し替える。略記で書けば略記のまま出る。
    return { ok: true, part: { ...part, type: resolvePartTypeName(text) ?? part.type, written: text } as PartSpec };
  }

  if (field === 'label') {
    if (part.kind !== 'two-terminal') {
      return fail(`${part.id} には l= を書けません (2 端子の部品だけ)`, line);
    }
    return { ok: true, part: { ...part, label: text === '' ? null : text } };
  }

  if (part.kind === 'one-terminal') return fail(`${part.id} には値を書けません (「種類 番地」だけ)`, line);
  if (text.includes('=')) return fail('値に = は書けません (札と紛れます)', line);
  if (part.kind === 'two-terminal' && part.voltage !== null && text !== '') {
    return fail('v= の字と値は図の同じ側に出ます (どちらか片方にします)', line);
  }
  return { ok: true, part: { ...part, value: text === '' ? null : text } };
}

