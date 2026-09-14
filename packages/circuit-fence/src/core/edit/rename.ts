import { RENAME_REFUSAL } from 'fence-kit';
import { isReferenceable, LIMITS } from '../limits.ts';
import { normalizeNewlines } from '../newlines.ts';
import { parseFence } from '../parser/parseFence.ts';
import type { NoteSpec, WireSpec } from '../types.ts';
import { isRepeatedName, nameOfHandle, partOfHandle } from './handles.ts';
import { namesNet } from '../parts.ts';
import { applyEdits, fail, keySpanOf, locatePart } from './shared.ts';
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

/**
 * 行の中の綴り。**空白に加えてフロー形式の区切り (`[` `]` `{` `}` `,`) でも切る** —
 * `wires: [U1.out -- a1, …]` の `[U1.out` を 1 つの綴りと取ると、足の名前を見落として
 * 改名したあとも古い名前を指したまま残る。
 */
const tokensOf = (text: string): readonly Token[] =>
  [...uncommented(text).matchAll(/[^\s[\]{},]+/g)].map((match) => ({ column: match.index ?? 0, text: match[0] }));

export function renamePart(source: string, handle: string, to: string): RewriteResult {
  const normalized = normalizeNewlines(source);
  const { doc } = parseFence(normalized);

  const part = partOfHandle(doc.parts, handle);
  const from = nameOfHandle(handle);
  if (!part) return fail(`部品が見つかりません: ${from}`, null);
  if (from === to) return { ok: true, value: { edits: [], lines: [], diff: { lost: [], gained: [] } } };

  if (!isReferenceable(to)) {
    return fail(`部品 ID ${to} は使えません (英数字と _ - だけの ${LIMITS.idLength} 文字まで)`, part.line);
  }
  // **同じ名前を名乗れる記号どうしなら通す** (`port` / `vcc` / `vee`)。
  // 名前を揃えるのは「同じネットにする」という意思表示で、書き手がやりたいこと
  // そのもの — 断ると、フェンスを手で直すしかなくなる。
  const merges = namesNet(part.type)
    && doc.parts.every((other) => other.id !== to || namesNet(other.type));
  if (!merges && doc.parts.some((other) => other.id === to)) {
    return fail(`部品 ID ${to} はもう使われています`, part.line);
  }
  if (doc.points.has(to)) return fail(`${to} は番地の名前として使われています`, part.line);

  const lines = normalized.split('\n');
  const edits: Edit[] = [];

  // 1. 鍵 (`R1:`)。1 行に部品が 2 つ並ぶ形でも、その部品の綴りだけを見る
  //    (名札で 1 つに決めた部品の、行の中の位置から探す)。
  const text = lines[part.line - 1];
  const cursor = locatePart(doc, lines, handle)?.from ?? 0;
  const key = text === undefined ? null : keySpanOf(text, from, cursor);
  if (key === null) return fail(`${from} を書いている場所が見つかりませんでした`, part.line);
  edits.push({ line: part.line, column: key.column, length: key.length, text: to });

  // **同じ名前がまだ残るなら、指しているものは書き換えない。** `VCC` を 2 つ
  // 描いた図で片方の名前を変えても、配線や注釈が指す `VCC` はもう 1 つのほう。
  if (isRepeatedName(doc.parts, from)) {
    return { ok: true, value: { edits, lines: [], diff: { lost: [], gained: [] } } };
  }

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
  // **同じ行に先に書いた注釈の続きから探す** (`notes: [circle R1, circle R1 red]`)。
  // 頭から探すと 2 つ目も 1 つ目の綴りを拾い、2 つ目の名前が古いまま残る。
  const cursors = new Map<number, number>();
  for (const note of doc.notes) {
    const slots = REFERENCES[note.kind] ?? 0;
    const tokens = tokensOf(lines[note.line - 1] ?? '');
    const start = tokens.findIndex((token, index) => index >= (cursors.get(note.line) ?? 0) && token.text === note.kind);
    if (start >= 0) cursors.set(note.line, start + 1);

    const wanted = referencesOf(note).filter((name) => name === from).length;
    if (wanted === 0) continue;
    const hits = start < 0 ? [] : tokens.slice(start + 1, start + 1 + slots).filter((token) => token.text === from);
    if (hits.length < wanted) return fail(`${note.line} 行目の ${from} を綴りとして取り出せませんでした`, note.line);
    for (const hit of hits) edits.push({ line: note.line, column: hit.column, length: from.length, text: to });
  }

  if (!renamedAll(normalized, edits, from)) return fail(`${from}: ${RENAME_REFUSAL}`, part.line);
  // **つながりは 1 つも変わらない。** ネットリストは端子を名前で呼ぶので比べると
  // 組が全部入れ替わって見えるが、それは名前の話で、接続の話ではない。
  return { ok: true, value: { edits, lines: [], diff: { lost: [], gained: [] } } };
}

/**
 * 書いたあと読み直して、**古い名前を指すものが残っていないか** (配線の足と注釈)。
 * 部品の数と YAML の構文エラーも動かないこと。取りこぼすと、配線が黙って切れる。
 */
function renamedAll(source: string, edits: readonly Edit[], from: string): boolean {
  const before = parseFence(source);
  const after = parseFence(applyEdits(source, edits));
  const yamlErrors = (errors: readonly { readonly message: string }[]): number =>
    errors.filter((error) => error.message.startsWith('YAML')).length;
  const pinOf = (end: WireSpec['from']): boolean => end.kind === 'pin' && end.part === from;
  return yamlErrors(after.errors) <= yamlErrors(before.errors)
    && after.doc.parts.length === before.doc.parts.length
    && !after.doc.wires.some((wire) => pinOf(wire.from) || pinOf(wire.to))
    && !after.doc.notes.some((note) => referencesOf(note).includes(from));
}
