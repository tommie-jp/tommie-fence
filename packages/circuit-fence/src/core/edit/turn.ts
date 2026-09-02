import { formatAddress } from '../model/address.ts';
import { normalizeNewlines } from '../newlines.ts';
import { nameOfHandle, partOfHandle } from './handles.ts';
import { parseFence } from '../parser/parseFence.ts';
import { MIRROR_WORD, isRotationWord, rotationWord } from '../parser/compact.ts';
import { LIMITS } from '../limits.ts';
import { lookupPartType, orientOf } from '../parts.ts';
import type { Turn } from '../parts.ts';
import { applyRewrite, diffOf, fail, isOnGrid, locatePart, tokensFrom, wordEdit } from './shared.ts';
import type { Edit, RewriteResult } from './shared.ts';
import type { Circuit } from '../model/circuit.ts';
import type { PartSpec } from '../types.ts';

/**
 * 2 端子部品を回す・反転する。**フェンス本文 → 書き換えの並び**を返す純関数で、
 * vscode を知らない (設計上の約束 1)。
 *
 * **掴む物によって書き換えが変わる。** 2 端子部品の向きは番地の順そのものなので、
 * 回すのは「もう一方の端をアンカーの周りに 90 度動かす」、反転は「両端の
 * 入れ替え」。多端子と `ground` は 1 つの番地に置くので番地では回せず、
 * **向きの語** (`r90` / `mirror`) を書き換える。使う人にとってはどちらも
 * 「回す」「裏返す」の 1 つの操作なので、違いはここで吸収する。
 *
 * **書ける範囲は `parts.ts` の表が持つ** (`orientOf`)。断る文面は文法側
 * (`model/circuit.ts` の `checkOrientation`) と揃える — 同じことを 2 通りの
 * 言い方で断ると、書いた人はどちらが本当か決められない。
 *
 * 番地の探し方は `move.ts` と同じ `locatePart` を通す。別々に持つと、
 * 1 行に部品が 2 つ並ぶフロー形式で片方だけが違う綴りを書き換える。
 */

/** 格子は行が下へ、列が右へ増える。時計回りは (行, 列) → (列, -行)。 */
const quarter = (row: number, col: number, clockwise: boolean): { readonly row: number; readonly col: number } =>
  (clockwise ? { row: col, col: -row } : { row: -col, col: row });

/** 90 度を `quarters` 回。正が時計回り (0 は何もしない)。 */
function spin(delta: { readonly row: number; readonly col: number }, quarters: number) {
  const times = ((quarters % 4) + 4) % 4;
  return Array.from({ length: times }).reduce<{ readonly row: number; readonly col: number }>(
    (turnedSoFar) => quarter(turnedSoFar.row, turnedSoFar.col, true),
    delta,
  );
}

/** 書き換えを組み立て、前後のネットリストを比べる。 */
function rewriteOf(source: string, edits: readonly Edit[]): RewriteResult {
  const rewrite = { edits, lines: [], diff: { lost: [], gained: [] } };
  return { ok: true, value: { ...rewrite, diff: diffOf(source, applyRewrite(source, rewrite)) } };
}

/** 掴んだ部品を取り出す。回すのも裏返すのも、まずここを通る。 */
function partAt(source: string, handle: string, what: string) {
  const normalized = normalizeNewlines(source);
  const { doc } = parseFence(normalized);
  if (!doc) return fail(`フェンスを読めないので${what}できません (先にエラーを直します)`, null);

  const part = partOfHandle(doc.parts, handle);
  if (!part) return fail(`部品が見つかりません: ${nameOfHandle(handle)}`, null);

  return { ok: true as const, normalized, doc, part };
}

/** 2 端子部品の端の綴り。番地で回す側が使う。 */
function endsOf(normalized: string, doc: Circuit, part: PartSpec, handle: string) {
  const located = locatePart(doc, normalized.split('\n'), handle);
  if (located === null) {
    return fail(`${nameOfHandle(handle)} の行から番地を見つけられませんでした`, part.line);
  }
  return { ok: true as const, tokens: located.tokens };
}

/** 90 度を `quarters` 回したあとの角度。一周は元に戻る。 */
const spinBy = (rotate: Turn['rotate'], quarters: number): Turn['rotate'] =>
  ((((rotate / 90 + quarters) % 4) + 4) % 4) * 90 as Turn['rotate'];

/**
 * 向きの語を書き換える (多端子と `ground`)。**番地は動かさない** —
 * 1 つの番地に置く記号なので、変わるのは向きだけで場所は変わらない。
 *
 * 語は**最後の番地のすぐ後ろ**に足す (`ID: 種類 番地 [向き] [型番]` の並び)。
 * 呼ぶ側は回転か反転の**どちらか一方だけ**を変える — 両方を一度に変えると、
 * 語が無いときに同じ桁へ 2 つ挿し込むことになる。
 */
function turnByWord(
  normalized: string,
  doc: Circuit,
  part: PartSpec,
  handle: string,
  next: Turn,
): RewriteResult {
  const partId = nameOfHandle(handle);
  const lines = normalized.split('\n');
  const lineText = lines[part.line - 1];
  if (lineText === undefined) return fail(`${partId} の行が見つかりませんでした`, part.line);

  // フロー形式は 1 行が部品 1 つに対応しないので、語を足す場所が決まらない。
  const shares = doc.parts.some((other) => other.line === part.line && other !== part);
  if (shares || /^\s*parts\s*:/.test(lineText)) {
    return fail(`${partId}: フロー形式 (1 行に書いた形) の部品は向きを書けません。手で書きます`, part.line);
  }

  const ends = endsOf(normalized, doc, part, handle);
  if (!ends.ok) return ends;

  const last = ends.tokens.at(-1);
  const after = last === undefined ? 0 : last.column + last.length;
  const tail = tokensFrom(lineText, after);
  const was = part.kind === 'two-terminal' ? { rotate: 0 as const, mirror: false } : part.turn;

  const edits: readonly Edit[] = [
    ...(next.rotate === was.rotate ? [] : wordEdit(
      part.line,
      tail.find((token) => isRotationWord(token.text)) ?? null,
      rotationWord(next.rotate),
      after,
    )),
    ...(next.mirror === was.mirror ? [] : wordEdit(
      part.line,
      tail.find((token) => token.text === MIRROR_WORD) ?? null,
      next.mirror ? MIRROR_WORD : '',
      after,
    )),
  ];
  return rewriteOf(normalized, edits);
}

/** その記号に向きを書けるか。書けないなら文法側と同じ文面で断る。 */
function orientOfPart(part: PartSpec, aspect: 'rotate' | 'mirror') {
  const type = lookupPartType(part.type);
  if (type === null) return fail(`${part.type} は知らない部品の種類です`, part.line);

  const orient = orientOf(type);
  if (aspect === 'rotate' && !orient.rotate) {
    return fail(
      `${part.type} は回せません${orient.mirror ? ' (この記号は反転だけ書けます)' : ' (回せるのは多端子部品と ground です)'}`,
      part.line,
    );
  }
  if (aspect === 'mirror' && !orient.mirror) {
    return fail(`${part.type} に mirror は書けません${orient.rotate ? ' (回転だけ書けます)' : ''}`, part.line);
  }
  return { ok: true as const };
}

/**
 * 端の綴りを書き戻す編集 (綴りの長さが変わっても桁は当たる)。
 *
 * **書かれたままでよい端は触らない** (`null` を渡す)。`points:` の名前で
 * 書かれた端を番地に直すと、名前が外れて**あとで点を動かしても部品が
 * 付いてこない**。ネットの差分は空なので、何も言わずに切れる。
 */
const editsFor = (
  line: number,
  tokens: readonly { readonly column: number; readonly length: number }[],
  texts: readonly (string | null)[],
): readonly Edit[] =>
  tokens.flatMap((token, index) => {
    const text = texts[index];
    if (text === undefined || text === null) return [];
    return [{ line, column: token.column, length: token.length, text }];
  });

export function turnPart(source: string, handle: string, quarters: number): RewriteResult {
  const found = partAt(source, handle, '回');
  if (!found.ok) return found;

  const { normalized, doc, part } = found;
  const partId = nameOfHandle(handle);

  // 多端子と ground は 1 つの番地に置くので、番地では回せない。語のほうを書く。
  if (part.kind !== 'two-terminal') {
    const allowed = orientOfPart(part, 'rotate');
    if (!allowed.ok) return allowed;
    return turnByWord(normalized, doc, part, handle, {
      ...part.turn,
      rotate: spinBy(part.turn.rotate, quarters),
    });
  }

  const ends = endsOf(normalized, doc, part, handle);
  if (!ends.ok) return ends;
  const { tokens } = ends;

  // **アンカー (先に書いた端) は動かさない。** 動かすと「回す」が「移動」になる。
  const delta = spin({ row: part.to.row - part.from.row, col: part.to.col - part.from.col }, quarters);
  const to = { row: part.from.row + delta.row, col: part.from.col + delta.col };
  if (!isOnGrid(to)) {
    return fail(
      `${partId} を回すと格子の外へ出ます (a〜z の 26 行、1〜${LIMITS.columns} 列)`,
      part.line,
    );
  }
  // **一周は何もしない。** 同じ字を書き戻すと、呼ぶ側の「変わっていない」判定を
  // 素通りして、書類が汚れ・元に戻す段が積まれ・「動かしました」と言われる。
  if (to.row === part.to.row && to.col === part.to.col) return rewriteOf(normalized, []);

  // アンカーは書かれたまま (名前で書かれていれば名前のまま)。動くのは反対の端だけ。
  return rewriteOf(normalized, editsFor(part.line, tokens, [null, formatAddress(to)]));
}

export function flipPart(source: string, handle: string): RewriteResult {
  const found = partAt(source, handle, '反転');
  if (!found.ok) return found;

  const { normalized, doc, part } = found;

  // 多端子は mirror の語で裏返す。2 端子は番地の入れ替えそのものが裏返し。
  if (part.kind !== 'two-terminal') {
    const allowed = orientOfPart(part, 'mirror');
    if (!allowed.ok) return allowed;
    return turnByWord(normalized, doc, part, handle, { ...part.turn, mirror: !part.turn.mirror });
  }

  const ends = endsOf(normalized, doc, part, handle);
  if (!ends.ok) return ends;
  const { tokens } = ends;

  // 端の入れ替え。**同じ 2 つの升を使う**ので、接続は変わらない (極性だけが変わる)。
  // **綴りごと入れ替える** — 番地に直すと `points:` の名前が外れる。
  const line = normalized.split('\n')[part.line - 1] ?? '';
  const spelling = (index: number): string => {
    const token = tokens[index];
    return token === undefined ? '' : line.slice(token.column, token.column + token.length);
  };

  return rewriteOf(normalized, editsFor(part.line, tokens, [spelling(1), spelling(0)]));
}
