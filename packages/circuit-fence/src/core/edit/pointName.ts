import { appendUnderKey, dropLines, isFlowKey, keyLineOf } from 'fence-kit';
import { formatAddress, parseAddress } from '../model/address.ts';
import { isReferenceable, LIMITS } from '../limits.ts';
import { normalizeNewlines } from '../newlines.ts';
import { parseFence } from '../parser/parseFence.ts';
import { safeToken } from '../errors.ts';
import { addressTokensOn, addressesOf, fail, locateTokens } from './shared.ts';
import type { Edit, RewriteResult, Span } from './shared.ts';
import { nodesOf } from './point.ts';
import type { PartFields } from 'fence-kit';
import type { Circuit } from '../model/circuit.ts';

/** 名前を付け替えても**つながりは変わらない** (同じ交点を別の綴りで指すだけ)。 */
const NO_DIFF = { lost: [], gained: [] } as const;

/**
 * 節点に名前を付ける (`points:`)。**図を直しても名前が動かない**のが `points:` の
 * 値打ちで、同じ節点を何か所からも指すときに直すのは 1 行だけになる。
 *
 * 升目で節点を選ぶと欄に名前が出て、そこへ書けばこの道を通る。書くのは 2 つ:
 *
 * - `points:` の 1 行 (足す・名前を替える・消す)
 * - **その節点を書いていた場所の綴り** — 名前を付けたら名前に、外したら番地に
 *
 * **片方だけでは済まない。** `points:` に足しただけでは図は何も変わらず、
 * 綴りだけ替えると読めなくなる。1 回の書き換えで両方を当てる。
 */

/** 節点 1 つを指す名札。**殻とフェンスの取り決め**なので、綴りはここに置く。 */
const NODE_PREFIX = 'node:';

export const nodeHandleOf = (spelling: string): string => `${NODE_PREFIX}${spelling}`;
export const isNodeHandle = (handle: string): boolean => handle.startsWith(NODE_PREFIX);

/** 名札から番地の綴りへ。節点の名札でなければ null。 */
export const nodeSpellOf = (handle: string): string | null =>
  (isNodeHandle(handle) ? handle.slice(NODE_PREFIX.length) : null);

/**
 * 選んだ節点の欄。**直せるのは名前だけ** — 節点は交点そのもので、種類も値も
 * 持たない。種類の欄には番地を出す (何を選んでいるかが読めるように)。
 */
export function nodeFields(source: string, handle: string): PartFields | null {
  const spelling = nodeSpellOf(handle);
  const at = spelling === null ? null : parseAddress(spelling);
  if (at === null) return null;

  const normalized = normalizeNewlines(source);
  const { doc } = parseFence(normalized);
  if (doc === null) return null;
  const node = nodesOf(doc, normalized).find((one) => formatAddress(one.address) === formatAddress(at));
  if (node === undefined) return null;

  return {
    id: node.name ?? '',
    type: formatAddress(node.address),
    value: '',
    label: '',
    color: '',
    can: ['id'],
  };
}

/** 行の中の 1 つの綴り。桁は 0 始まり。 */
type Token = Span;

/**
 * その節点を書いている場所。**`parts:` と `wires:` の行だけ**を見る
 * (`point.ts` の `bareTokens` と同じ理由 — 注釈の `circle C1 red` まで
 * 書き換えると図が壊れる)。
 *
 * `wanted` は綴りそのもので比べる。番地で書いた場所と名前で書いた場所は
 * 別の綴りなので、名前を付けるときは番地を、外すときは名前を渡す。
 */
function tokensSpelling(doc: Circuit, source: string, wanted: string): readonly Token[] {
  const lines = source.split('\n');
  const found: Token[] = [];

  const cursors = new Map<number, number>();
  for (const part of doc.parts) {
    const text = lines[part.line - 1];
    if (text === undefined) continue;
    const located = locateTokens(text, addressesOf(part), doc.points, cursors.get(part.line) ?? 0);
    if (located === null) continue;
    cursors.set(part.line, located.end);

    for (const token of located.tokens) {
      if (text.slice(token.column, token.column + token.length) !== wanted) continue;
      found.push({ line: part.line, column: token.column, length: token.length });
    }
  }

  for (const line of new Set(doc.wires.map((wire) => wire.line))) {
    const text = lines[line - 1];
    if (text === undefined) continue;
    for (const token of addressTokensOn(text, doc.points)) {
      if (text.slice(token.column, token.column + token.length) !== wanted) continue;
      found.push({ line, column: token.column, length: token.length });
    }
  }
  return found;
}

/** `points:` のその名前が書かれている行。無ければ 0。 */
function pointLineOf(source: string, name: string): number {
  const lines = source.split('\n');
  const key = keyLineOf(lines, 'points');
  if (key === 0) return 0;
  for (let at = key; at < lines.length; at += 1) {
    const text = lines[at] ?? '';
    // 鍵の次の階層だけを見る。次の鍵 (`parts:`) に当たったら終わり。
    if (at > key && /^\S/.test(text) && text.trim() !== '') return 0;
    if (new RegExp(`^\\s+${name}\\s*:`).test(text)) return at + 1;
  }
  return 0;
}

/** 書ける名前か。読めなくなる綴りは**書く前に**断る (帯で気づくのでは遅い)。 */
function nameProblem(doc: Circuit, name: string, was: string | null): string | null {
  if (!isReferenceable(name)) {
    return `${safeToken(name)} は名前に使えません (英数字と _ - だけの ${LIMITS.idLength} 文字まで)`;
  }
  if (parseAddress(name) !== null) return `${safeToken(name)} は番地そのものです (番地と読み分けられません)`;
  if (doc.parts.some((part) => part.id === name)) {
    return `${safeToken(name)} は部品の名前です (注釈の指し先でどちらか決められません)`;
  }
  if (name !== was && doc.points.has(name)) return `${safeToken(name)} はもう別の交点に付いています`;
  return null;
}

export function nameNode(source: string, handle: string, to: string): RewriteResult {
  const spelling = nodeSpellOf(handle);
  const at = spelling === null ? null : parseAddress(spelling);
  if (at === null) return fail(`番地として読めません: ${spelling ?? handle}`, null);

  const normalized = normalizeNewlines(source);
  const { doc } = parseFence(normalized);
  if (doc === null) return fail('フェンスを読めないので名前を付けられません (先にエラーを直します)', null);

  const node = nodesOf(doc, normalized).find((one) => formatAddress(one.address) === formatAddress(at));
  if (node === undefined) return fail(`${formatAddress(at)} には節点がありません (何も書かれていません)`, null);

  const was = node.name;
  const want = to.trim();
  if (want === (was ?? '')) return { ok: true, value: { edits: [], lines: [], diff: NO_DIFF } };

  const lines = normalized.split('\n');
  if (isFlowKey(lines, 'points')) {
    return fail('フロー形式 (1 行に書いた形) の points: には足せません。手で書きます', null);
  }

  const problem = want === '' ? null : nameProblem(doc, want, was);
  if (problem !== null) return fail(problem, null);

  // **綴りの入れ替えは 1 方向だけ。** 名前を付けるなら番地 → 名前、外すなら
  // 名前 → 番地、替えるなら古い名前 → 新しい名前。
  const from = was ?? formatAddress(at);
  const text = want === '' ? formatAddress(at) : want;
  const edits: readonly Edit[] = tokensSpelling(doc, normalized, from).map((token) => ({ ...token, text }));

  // **名前を替えるだけなら行は動かさない。** 鍵の綴りを差し替えれば済むので、
  // 消して足し直すと字下げも並びも作り直すことになる。
  if (was !== null && want !== '') {
    const key = keyTokenOf(lines, pointLineOf(normalized, was), was);
    if (key === null) return fail(`${safeToken(was)} を書いている points: の行を見つけられませんでした`, null);
    return { ok: true, value: { edits: [...edits, { ...key, text: want }], lines: [], diff: NO_DIFF } };
  }

  const dropped = was === null ? 0 : pointLineOf(normalized, was);
  const added = want === ''
    ? []
    : appendUnderKey(lines, 'points', pointsLastLine(normalized), `${want}: ${formatAddress(at)}`);
  // **最後の 1 行を消すなら鍵ごと。** `points:` だけが残ると中身の無いマップになり、
  // フェンスが読めなくなる。
  const removals = dropped === 0
    ? []
    : dropLines(pointsLastLine(normalized) === dropped && countPoints(normalized) === 1
      ? [keyLineOf(lines, 'points'), dropped]
      : [dropped]);

  return { ok: true, value: { edits, lines: [...removals, ...added], diff: NO_DIFF } };
}

/** `points:` の行にある名前そのものの綴り。無ければ null。 */
function keyTokenOf(lines: readonly string[], line: number, name: string): Span | null {
  const text = lines[line - 1];
  if (line === 0 || text === undefined) return null;
  const found = new RegExp(`^(\\s*)(${name})\\s*:`).exec(text);
  return found === null ? null : { line, column: (found[1] ?? '').length, length: name.length };
}

/** `points:` に書かれている行の数。 */
function countPoints(source: string): number {
  const lines = source.split('\n');
  const key = keyLineOf(lines, 'points');
  if (key === 0) return 0;
  let count = 0;
  for (let at = key; at < lines.length; at += 1) {
    const text = lines[at] ?? '';
    if (/^\S/.test(text) && text.trim() !== '') break;
    if (text.trim() !== '') count += 1;
  }
  return count;
}

/** `points:` の最後の行 (次の 1 行をその下に足す)。空なら 0。 */
function pointsLastLine(source: string): number {
  const lines = source.split('\n');
  const key = keyLineOf(lines, 'points');
  if (key === 0) return 0;
  let last = 0;
  for (let at = key; at < lines.length; at += 1) {
    const text = lines[at] ?? '';
    if (/^\S/.test(text) && text.trim() !== '') break;
    if (text.trim() !== '') last = at + 1;
  }
  return last;
}

