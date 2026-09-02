import { isReferenceable, LIMITS } from '../limits.ts';
import { normalizeNewlines } from '../newlines.ts';
import { parseFence } from '../parser/parseFence.ts';
import type { NoteSpec } from '../types.ts';
import { fail, keySpanOf } from './shared.ts';
import type { Edit, RewriteResult } from './shared.ts';

/**
 * 部品の名前を変える。**フェンス本文 → 書き換えの並び**を返す純関数で、
 * vscode を知らない (設計上の約束 1)。
 *
 * 名前は 3 か所に書かれる — 鍵 (`R1:`)、配線の足 (`R1.b`)、注釈の指し先
 * (`circle R1`)。**どれか 1 つでも見つからなければ断る。** 半分だけ書き換えると、
 * 図が壊れた状態で残る (残ったほうは「そんな部品はない」になる)。
 *
 * 行の中の綴りを差し替えるだけなので、**フロー形式でも効く** (足す・消すと違って
 * 行の対応が要らない)。ただし綴りが 1 つにつながっている書き方
 * (`notes: [circle R1]`) では指し先を綴りとして取り出せないので、そこは断る。
 */

/** 注釈が名前で指せる場所の数。`text` の指し先は番地なので数えない。 */
const REFERENCES: Partial<Record<NoteSpec['kind'], number>> = { circle: 1, arrow: 2, line: 2 };

/** その注釈が名前で指しているもの (番地で書かれていればそれも混じる)。 */
function referencesOf(note: NoteSpec): readonly string[] {
  if (note.kind === 'circle') return [note.target];
  if (note.kind === 'arrow' || note.kind === 'line') return [note.from, note.to];
  return [];
}

/** 行末コメントを落とした行 (`#` は行頭か空白の直後だけコメント)。 */
const uncommented = (text: string): string => {
  const comment = /(^|\s)#/.exec(text);
  return comment === null ? text : text.slice(0, comment.index);
};

type Token = { readonly column: number; readonly text: string };

const tokensOf = (text: string): readonly Token[] =>
  [...uncommented(text).matchAll(/\S+/g)].map((match) => ({ column: match.index ?? 0, text: match[0] }));

export function renamePart(source: string, from: string, to: string): RewriteResult {
  const normalized = normalizeNewlines(source);
  const { doc } = parseFence(normalized);
  if (!doc) return fail('フェンスを読めないので名前を変えられません (先にエラーを直します)', null);

  const part = doc.parts.find((candidate) => candidate.id === from);
  if (!part) return fail(`部品が見つかりません: ${from}`, null);
  if (from === to) return { ok: true, value: { edits: [], lines: [], diff: { lost: [], gained: [] } } };

  if (!isReferenceable(to)) {
    return fail(`部品 ID ${to} は使えません (英数字と _ - だけの ${LIMITS.idLength} 文字まで)`, part.line);
  }
  if (doc.parts.some((other) => other.id === to)) return fail(`部品 ID ${to} はもう使われています`, part.line);
  if (doc.points.has(to)) return fail(`${to} は番地の名前として使われています`, part.line);

  const lines = normalized.split('\n');
  const edits: Edit[] = [];

  // 1. 鍵 (`R1:`)。1 行に部品が 2 つ並ぶ形でも、その部品の綴りだけを見る。
  const text = lines[part.line - 1];
  const key = text === undefined ? null : keySpanOf(text, from, 0);
  if (key === null) return fail(`${from} を書いている場所が見つかりませんでした`, part.line);
  edits.push({ line: part.line, column: key.column, length: key.length, text: to });

  // 2. 配線の足 (`R1.b`)。綴りの頭だけを差し替える (足の名前は触らない)。
  for (const wire of doc.wires) {
    const ends = [wire.from, wire.to].filter((end) => end.kind === 'pin' && end.part === from);
    if (ends.length === 0) continue;

    const line = lines[wire.line - 1] ?? '';
    const hits = tokensOf(line).filter((token) => token.text.startsWith(`${from}.`));
    if (hits.length < ends.length) return fail(`${wire.line} 行目の ${from} を綴りとして取り出せませんでした`, wire.line);
    for (const hit of hits) {
      if (edits.some((edit) => edit.line === wire.line && edit.column === hit.column)) continue;
      edits.push({ line: wire.line, column: hit.column, length: from.length, text: to });
    }
  }

  // 3. 注釈の指し先 (`circle R1`)。**色や種類の綴りは触らない**ので、
  //    その注釈が名前を書ける場所だけを数えて見る (部品を `red` と名付けられる)。
  for (const note of doc.notes) {
    const slots = REFERENCES[note.kind] ?? 0;
    const wanted = referencesOf(note).filter((name) => name === from).length;
    if (wanted === 0) continue;

    const tokens = tokensOf(lines[note.line - 1] ?? '');
    const start = tokens.findIndex((token) => token.text === note.kind);
    const hits = start < 0 ? [] : tokens.slice(start + 1, start + 1 + slots).filter((token) => token.text === from);
    if (hits.length < wanted) return fail(`${note.line} 行目の ${from} を綴りとして取り出せませんでした`, note.line);
    for (const hit of hits) edits.push({ line: note.line, column: hit.column, length: from.length, text: to });
  }

  // **つながりは 1 つも変わらない。** ネットリストは端子を名前で呼ぶので比べると
  // 組が全部入れ替わって見えるが、それは名前の話で、接続の話ではない。
  return { ok: true, value: { edits, lines: [], diff: { lost: [], gained: [] } } };
}
