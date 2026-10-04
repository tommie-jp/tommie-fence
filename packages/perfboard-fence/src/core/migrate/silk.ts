import { scan } from '../edit/point.ts';
import { FENCE_SPELLING, formatAddress, isAddressSpelling, parseAddress } from '../model/address.ts';
import { parseFence } from '../parser/parseFence.ts';
import type { Address, Spelling } from '../types.ts';

/**
 * **一度だけ使う移行**。フェンスの番地を、基板のシルクの数え方 (`board: silk:` の既定) へ
 * 書き換える (52 の docs/108)。
 *
 * それまでの番地は、どの基板でも「英字が行 (上から)・数字が列 (左から)」で読んでいた
 * (`fence`)。いまは名前の基板 (`akizuki-c`・`7x5cm` など) の既定が基板の刷りどおりに
 * なったので、**図が同じになるように綴りだけを替える**。
 *
 * - 穴数で書いた基板 (`25x15`) は `fence` のままなので触らない
 * - `silk:` が書いてあるフェンスは、書いた人が数え方を決めているので触らない
 * - 替えたフェンスには `silk: board` を書き足す。**書いてあるフェンスは触らないので二度掛けても
 *   番地が替わり直さない** (印であり、基板の刷りどおりという既定の意味を明示する)
 * - 替えたあと、全部の番地を読み直して**図の中の位置が同じ**ことを確かめる。違えば何も替えない
 */

export type SilkMigration = {
  readonly source: string;
  readonly changed: boolean;
  /** 替えなかった理由、または確かめて合わなかった所。空なら問題なし。 */
  readonly problems: readonly string[];
};

type Edit = { readonly line: number; readonly column: number; readonly length: number; readonly text: string };

const unchanged = (source: string, problems: readonly string[] = []): SilkMigration =>
  ({ source, changed: false, problems });

/** 行の中で、境界 (空白・区切り) に挟まれた綴りの位置。無ければ -1。 */
function findWord(line: string, word: string, from: number): number {
  const boundary = /[\s,[\]{}:]/;
  for (let at = line.indexOf(word, from); at >= 0; at = line.indexOf(word, at + 1)) {
    const before = line[at - 1];
    const after = line[at + word.length];
    if ((before === undefined || boundary.test(before)) && (after === undefined || boundary.test(after))) return at;
  }
  return -1;
}

/** 書かれた綴りを、古い数え方で読んで新しい数え方で書き直す。番地でなければ null。 */
function respell(written: string, board: Spelling): string | null {
  const address = parseAddress(written, FENCE_SPELLING);
  return address === null ? null : formatAddress(address, board);
}

/** 部品・配線・点の綴り (`scan` が位置を知っている) と、注釈・機器の綴り。 */
function editsFor(source: string): readonly Edit[] {
  const lines = source.split('\n');
  const scanned = scan(source);
  const { doc } = parseFence(source);
  const edits = new Map<string, Edit>();
  const put = (line: number, column: number, length: number): void => {
    const text = respell(lines[line - 1]?.slice(column, column + length) ?? '', scanned.board);
    if (text !== null) edits.set(`${line}:${column}`, { line, column, length, text });
  };

  for (const token of scanned.written) {
    if (!token.byName) put(token.line, token.column, token.length);
  }

  for (const note of doc.notes) {
    const text = note.line === null ? undefined : lines[note.line - 1];
    if (note.line === null || text === undefined) continue;
    let cursor = text.indexOf(note.kind) + note.kind.length;
    for (const word of [note.from, note.to]) {
      if (word === null || !isAddressSpelling(word)) continue;
      const at = findWord(text, word, cursor);
      if (at < 0) continue;
      put(note.line, at, word.length);
      cursor = at + word.length;
    }
  }

  const wheres = new Set(doc.devices.flatMap((device) => (device.where === null ? [] : [device.where])));
  for (const [index, text] of lines.entries()) {
    const found = /^(\s+at:\s+)(\S+)/.exec(text);
    const word = found?.[2];
    if (found === null || word === undefined || !wheres.has(word)) continue;
    put(index + 1, (found[1] ?? '').length, word.length);
  }

  return [...edits.values()];
}

/**
 * `board:` に `silk: board` を書き足す。スカラー (`board: 7x5cm`) はマップにし、
 * マップは `size:` の次の行に足す。書き足せない形 (フロー形式) は null。
 */
function markSilk(source: string): string | null {
  const lines = source.split('\n');
  const at = lines.findIndex((line) => /^board:/.test(line));
  if (at < 0) return null;
  const line = lines[at] ?? '';
  const scalar = /^board:[ \t]+([^#\s{][^#]*?)[ \t]*(#.*)?$/.exec(line);
  if (scalar !== null) {
    const comment = scalar[2] === undefined ? '' : `  ${scalar[2]}`;
    lines.splice(at, 1, 'board:', `  size: ${scalar[1] ?? ''}${comment}`, '  silk: board');
    return lines.join('\n');
  }
  if (!/^board:[ \t]*(#.*)?$/.test(line)) return null;
  for (let index = at + 1; index < lines.length; index += 1) {
    const child = /^([ \t]+)size:/.exec(lines[index] ?? '');
    if (child !== null) {
      lines.splice(index + 1, 0, `${child[1] ?? '  '}silk: board`);
      return lines.join('\n');
    }
    if (/^\S/.test(lines[index] ?? '')) break;
  }
  return null;
}

/** 後ろから当てる (前の編集で後ろの桁がずれない)。 */
function applyEdits(source: string, edits: readonly Edit[]): string {
  const lines = source.split('\n');
  const ordered = [...edits].sort((a, b) => b.line - a.line || b.column - a.column);
  for (const edit of ordered) {
    const text = lines[edit.line - 1] ?? '';
    lines[edit.line - 1] = text.slice(0, edit.column) + edit.text + text.slice(edit.column + edit.length);
  }
  return lines.join('\n');
}

/** 部品の穴・配線の両端・点・注釈・機器の位置を、読んだ番地として並べる。 */
function positionsOf(source: string, spelling: (board: Spelling) => Spelling): readonly (Address | null)[] {
  const { doc } = parseFence(source);
  const board = spelling(doc.board);
  const names = new Map(doc.points.map((point) => [point.name, point.written]));
  const read = (written: string | null): Address | null => {
    if (written === null) return null;
    return parseAddress(names.get(written) ?? written, board);
  };
  return [
    ...doc.points.map((point) => read(point.written)),
    ...doc.parts.flatMap((part) => part.holes.map(read)),
    ...doc.wires.flatMap((wire) => [read(wire.from), read(wire.to)]),
    ...doc.notes.flatMap((note) => [read(note.from), read(note.to)]),
    ...doc.devices.map((device) => read(device.where)),
  ];
}

const sameAddress = (a: Address | null, b: Address | null): boolean =>
  a === null || b === null ? a === b : a.row === b.row && a.col === b.col && (a.rows ?? 0) === (b.rows ?? 0) && (a.cols ?? 0) === (b.cols ?? 0);

/** フェンス 1 つの番地を、基板のシルクの綴りへ。 */
export function migrateSilk(source: string): SilkMigration {
  if (/^\s*silk\s*:/m.test(source)) return unchanged(source);
  const { doc } = parseFence(source);
  if (doc.board.silk === 'fence') return unchanged(source);

  // `labels:` の `row` / `col` は廃止した。**替わる先が一通りではない**ので手で直す。
  if (/^\s+(row|col):\s*(alpha|numeric)\b/m.test(source)) {
    return unchanged(source, ['labels の row / col は廃止しました。silk: で振り方を選び直してください']);
  }

  const edits = editsFor(source);
  // 番地が 1 つも無い図は、数え方が替わっても図は同じ。印も足さない。
  if (edits.length === 0) return unchanged(source);
  const edited = applyEdits(source, edits);
  const migrated = markSilk(edited);
  if (migrated === null) return unchanged(source, ['board: の書き方が `silk: board` を足せない形です (フロー形式)。手で直してください']);

  // 確かめ: 古い数え方で読んだ元の本文と、新しい数え方で読んだ移行後の本文で、
  // 全部の番地が同じ場所を指していること。
  const before = positionsOf(source, () => FENCE_SPELLING);
  const after = positionsOf(migrated, (board) => board);
  const problems = before.flatMap((address, index) =>
    sameAddress(address, after[index] ?? null) ? [] : [`${index + 1} 番目の番地が移行で別の場所になります`]);
  if (before.length !== after.length) problems.push('読めた番地の数が移行で変わります');
  return problems.length > 0 ? unchanged(source, problems) : { source: migrated, changed: true, problems: [] };
}
