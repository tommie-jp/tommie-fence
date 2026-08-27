import { fail, fenceError, ok, safeToken } from '../errors.ts';
import { LIMITS, isReferenceable } from '../limits.ts';
import { formatAddress, isSameAddress, parseAddress } from '../model/address.ts';
import type { Address, WireOperator } from '../model/address.ts';
import {
  DEFAULT_NOTE_ALIGN, DEFAULT_NOTE_SIZE, NOTE_ALIGNS, NOTE_COLOR_NAMES, NOTE_SIZE_NAMES,
  isNoteAlign, isNoteSize, noteColor,
} from '../notes.ts';
import type { NoteAlign, NoteSize } from '../notes.ts';
import { closestPartType, lookupPartType, partTypeNames, resolvePartTypeName } from '../parts.ts';
import type { PartTypeName } from '../parts.ts';
import { isNoteDrawable } from '../tex/escape.ts';
import type { Endpoint, FenceError, NoteSpec, NoteTextStyle, PartSpec, Result, WireSpec } from '../types.ts';

/** 配線の演算子。TikZ と同じ 3 つだけ (学習コストを増やさない)。 */
const WIRE_OPERATOR = /\s*(--|-\||\|-)\s*/;

const typeList = (): string => partTypeNames().join(' / ');

/** `U1.out` `Q1.B` の形。部品 ID と足の名前を分ける。 */
const PIN_REFERENCE = /^([\w-]+)\.([^\s.]+)$/;

/** 書ける向き。今のところオペアンプの ± の上下だけ。 */
export const ORIENTATIONS = ['+up', '+down'] as const;

/**
 * 番地に付けた名前 (`points:`) の表。番地が書ける場所ならどこでも引く。
 * 名前が無いフェンスでは空の表が渡る (呼ぶ側で場合分けしない)。
 */
export type Points = ReadonlyMap<string, Address>;

export const NO_POINTS: Points = new Map();

/**
 * 番地を読む。**名前を先に引き、無ければ番地として読む**。
 * 名前には番地の形を許していない (parseFence) ので、どちらとも読める字はない。
 */
const readAddress = (token: string, line: number, points: Points = NO_POINTS): Result<Address> => {
  const named = points.get(token);
  if (named !== undefined) return ok(named);

  const address = parseAddress(token);
  if (address !== null) return ok(address);

  // 番地の形でもないなら、名前のつもりで書かれた可能性がある。
  // 名前を 1 つでも書いてある図では、そちらの案内も添える。
  const hint = points.size === 0
    ? `行 a〜z + 列 1〜${LIMITS.columns}`
    : `行 a〜z + 列 1〜${LIMITS.columns}。points: に書いた名前でもありません`;
  return fail(`${safeToken(token)} は番地の形ではありません (${hint})`, line);
};

/**
 * 読み取り中の 1 行の頭。種類は正式名に畳んであり、`written` だけが
 * 書かれた綴り (略記のことがある) を覚えている。
 * エラー文には `written` を出す — 書いた行と照らせないと行番号が生きない。
 */
type PartHead = {
  readonly id: string;
  readonly type: PartTypeName;
  readonly written: string;
  readonly line: number;
  readonly points: Points;
};

/**
 * `resistor a1 a3 10k` の 1 行を読む。略記 (`r a1 a3 10k`) もここで受ける。
 * 両端が斜めでも通す (circuitikz は任意の角度に引ける)。同じ番地どうしだけは
 * 向きも長さも決まらないので通さない。
 */
export function parseCompactPart(
  id: string,
  text: string,
  line: number,
  points: Points = NO_POINTS,
): Result<PartSpec> {
  const tokens = text.trim().split(/\s+/).filter((token) => token.length > 0);
  const [written, ...rest] = tokens;

  if (written === undefined) {
    return fail(`部品 ${safeToken(id)} の種類がありません (${typeList()} が使えます)`, line);
  }

  // 略記はここで正式名に畳む。以降と中間モデルには正式名だけが流れる。
  const typeName = resolvePartTypeName(written);
  const type = typeName === null ? null : lookupPartType(typeName);
  if (typeName === null || type === null) {
    // 種類が増えるほど羅列は読みにくいので、近いものがあればそれだけを添える。
    const closest = closestPartType(written);
    const hint = closest === null ? `${typeList()} が使えます` : `${closest} のことですか?`;
    return fail(`種類 ${safeToken(written)} は知りません (${hint})`, line);
  }

  const head: PartHead = { id, type: typeName, written, line, points };
  if (type.kind === 'two-terminal') return readTwoTerminal(head, rest);
  return type.kind === 'one-terminal' ? readOneTerminal(head, rest) : readMultiTerminal(head, rest);
}

/**
 * `Q1: npn d8 2SC1815` / `U1: opamp c5 +up` の形。
 * 番地のあとに来るのは向きか値。向きは決まった語なので見分けられる。
 */
function readMultiTerminal(head: PartHead, rest: string[]): Result<PartSpec> {
  const { id, type, written, line, points } = head;
  const shape = `${safeToken(written)} は「種類 番地 [向き] [型番]」で書きます`;

  const [atToken, ...extra] = rest;
  if (atToken === undefined) return fail(shape, line);

  const at = readAddress(atToken, line, points);
  if (!at.ok) return at;

  let orientation: string | null = null;
  let value: string | null = null;

  for (const token of extra) {
    if ((ORIENTATIONS as readonly string[]).includes(token)) {
      orientation = token;
      continue;
    }
    if (value !== null) return fail(shape, line);
    if ([...token].length > LIMITS.valueLength) {
      return fail(`値が長すぎます (${LIMITS.valueLength} 文字まで)`, line);
    }
    value = token;
  }

  return ok({ kind: 'multi-terminal', id, type, at: at.value, value, orientation, line });
}

function readTwoTerminal(head: PartHead, rest: string[]): Result<PartSpec> {
  const { id, type, written, line, points } = head;
  const [fromToken, toToken, value, ...extra] = rest;

  if (fromToken === undefined || toToken === undefined || extra.length > 0) {
    return fail(`${safeToken(written)} は「種類 番地 番地 [値]」で書きます`, line);
  }

  const from = readAddress(fromToken, line, points);
  if (!from.ok) return from;
  const to = readAddress(toToken, line, points);
  if (!to.ok) return to;

  if (isSameAddress(from.value, to.value)) {
    return fail(`${safeToken(written)} の両端が同じ番地です (${formatAddress(from.value)})`, line);
  }
  if (value !== undefined && [...value].length > LIMITS.valueLength) {
    return fail(`値が長すぎます (${LIMITS.valueLength} 文字まで)`, line);
  }

  return ok({ kind: 'two-terminal', id, type, from: from.value, to: to.value, value: value ?? null, line });
}

function readOneTerminal(head: PartHead, rest: string[]): Result<PartSpec> {
  const { id, type, written, line, points } = head;
  const [atToken, ...extra] = rest;

  if (atToken === undefined || extra.length > 0) {
    return fail(`${safeToken(written)} は「種類 番地」で書きます`, line);
  }

  const at = readAddress(atToken, line, points);
  if (!at.ok) return at;

  return ok({ kind: 'one-terminal', id, type, at: at.value, line });
}

/** 配線 1 行の書き方。端点はいくつ並べてもよい。 */
const WIRE_FORM = '「端点 -- 端点 [-- 端点 …]」';

/**
 * `a3 -- a4` や `b1 -- b3 |- U1.+` の 1 行を読む。演算子は TikZ と同じ 3 つ。
 *
 * - `--` まっすぐ。端点が揃っていなくてもそのまま斜めに引く (勝手に折らない)
 * - `-|` 先に横、それから縦
 * - `|-` 先に縦、それから横
 *
 * 端点は 3 つ以上並べられる。1 行が 1 本の信号経路として読めるようにするための
 * 書き方で、**ここで隣どうしの 1 区間ずつに開いて返す**。中間モデルから先は
 * 区間の並びしか見ないので、黒丸も T 字もネットリストもそのまま使える。
 * どの区間も行番号は書かれた 1 行のまま (折り返した先を指しても直しに行けない)。
 */
export function parseWireLine(
  text: string,
  line: number,
  points: Points = NO_POINTS,
): Result<readonly WireSpec[]> {
  // 端点 n 個と演算子 n-1 個が交互に並ぶので、割った結果は必ず奇数長になる。
  const tokens = text.trim().split(WIRE_OPERATOR);
  if (tokens.length < 3 || tokens.length % 2 === 0) {
    return fail(`配線は ${WIRE_FORM} で書きます`, line);
  }

  const endpoints: Endpoint[] = [];
  for (let index = 0; index < tokens.length; index += 2) {
    const token = tokens[index] ?? '';
    // 端点を書き忘れた (`a1 -- a3 --`)。空の字を「番地の形ではありません」と
    // 返しても、どこが空なのか読めない。書き方のほうを返す。
    if (token.length === 0) return fail(`配線は ${WIRE_FORM} で書きます`, line);

    const endpoint = readEndpoint(token, line, points);
    if (!endpoint.ok) return endpoint;
    endpoints.push(endpoint.value);
  }

  const wires: WireSpec[] = [];
  for (const [index, from] of endpoints.slice(0, -1).entries()) {
    const to = endpoints[index + 1];
    const operator = tokens[index * 2 + 1];
    if (to === undefined || operator === undefined) continue;

    if (from.kind === 'cell' && to.kind === 'cell' && isSameAddress(from.address, to.address)) {
      return fail(`配線の両端が同じ番地です (${formatAddress(from.address)})`, line);
    }
    wires.push({ from, to, operator: operator as WireOperator, line });
  }

  return ok(wires);
}

/** 配線の端。`a3` のような番地か、`U1.out` のような足。 */
function readEndpoint(token: string, line: number, points: Points): Result<Endpoint> {
  const pin = PIN_REFERENCE.exec(token);
  if (pin) {
    const [, part = '', name = ''] = pin;
    return ok({ kind: 'pin', part, pin: name });
  }

  const address = readAddress(token, line, points);
  return address.ok ? ok({ kind: 'cell', address: address.value }) : address;
}

/** 注釈の種類。図に重ねる印 3 つと、字を置くもの 2 つ。 */
const NOTE_KINDS = ['circle', 'box', 'arrow', 'text', 'source'] as const;

/** 印の既定の色。目立たせるために書くものなので、書かなければ赤。 */
const DEFAULT_MARK_COLOR = 'red';

/** 太字にする語。大きさや寄せと違って 1 語しかないので、表を持たない。 */
const BOLD_WORD = 'bold';

/** 注釈の字に使える字。escape.ts の関門と対にして書く (片方だけ増やさない)。 */
const NOTE_CHARSET = '英数字と . + - / ( ) _ % : 、日本語、µ Ω °';

/**
 * 字は YAML の値として書く。**フェンスの側で引用符を決めない**のは、
 * YAML のプレーンスカラーに `: ` を書けないため (`- text b1 "R1: resistor"` は
 * 黙ってマップになり、エラーにもならない)。値にすれば引用は YAML の仕事になる。
 */
const TEXT_FORM = '「- text 番地 [色や大きさ]: 文字」';
const CIRCLE_FORM = '「- circle 部品IDか番地 [色]」';
const BOX_FORM = '「- box 番地 番地 [色]」';
const ARROW_FORM = '「- arrow 起点 終点 [色]」';
const SOURCE_FORM = '「- source 番地 [色や大きさ]」';

/** 字を持たない注釈の書き方。`:` を書いてしまった人に、正しい形を返すのに使う。 */
const LINE_FORMS: Readonly<Record<string, string>> = {
  circle: CIRCLE_FORM,
  box: BOX_FORM,
  arrow: ARROW_FORM,
  source: SOURCE_FORM,
};

/**
 * その種類の書き方。**自分の持ちものだけ**を見る。素の `[名前]` で引くと
 * `toString` のような Object.prototype の名前が当たり、書き方でない値を
 * そのまま図の下の帯に出してしまう。
 */
const lineFormOf = (kind: string): string | null =>
  Object.hasOwn(LINE_FORMS, kind) ? (LINE_FORMS[kind] ?? null) : null;

const noteKindList = (): string => NOTE_KINDS.join(' / ');

/** 字に添えられる語ぜんぶ。知らない語を返すときの案内に使う。 */
const wordHint = (): string =>
  `色: ${NOTE_COLOR_NAMES.join(' / ')}、` +
  `大きさ: ${NOTE_SIZE_NAMES.join(' / ')}、` +
  `寄せ: ${NOTE_ALIGNS.join(' / ')}、太字: ${BOLD_WORD}`;

const readNoteColor = (token: string, line: number): Result<string> =>
  noteColor(token) === null
    ? fail(`注釈の色 ${safeToken(token)} は知りません (${NOTE_COLOR_NAMES.join(' / ')} が使えます)`, line)
    : ok(token);

const writtenTwice = (what: string, first: string, second: string, line: number): FenceError =>
  fenceError(`注釈の${what}が二重に書かれています (${safeToken(first)} と ${safeToken(second)})`, line);

/**
 * 字に添えられた語を読む。**語ごとに読む場所を決めない**ので、
 * 色・大きさ・寄せ・太字をどの順に書いてもよい (書き手が順を覚えなくて済む)。
 *
 * 二重に書かれたら理由を返す。後に書いたほうを黙って勝たせると、
 * 直したつもりの指定が効かない図が出る (約束 5)。
 */
function readTextStyle(tokens: readonly string[], line: number): Result<NoteTextStyle> {
  let color: string | null = null;
  let size: NoteSize | null = null;
  let align: NoteAlign | null = null;
  let bold = false;

  for (const token of tokens) {
    if (noteColor(token) !== null) {
      if (color !== null) return { ok: false, error: writtenTwice('色', color, token, line) };
      color = token;
    } else if (isNoteSize(token)) {
      if (size !== null) return { ok: false, error: writtenTwice('大きさ', size, token, line) };
      size = token;
    } else if (isNoteAlign(token)) {
      if (align !== null) return { ok: false, error: writtenTwice('寄せ', align, token, line) };
      align = token;
    } else if (token === BOLD_WORD) {
      if (bold) return { ok: false, error: writtenTwice('太字', BOLD_WORD, token, line) };
      bold = true;
    } else {
      return fail(`注釈の言葉 ${safeToken(token)} は知りません (${wordHint()} が使えます)`, line);
    }
  }

  return ok({ color, size: size ?? DEFAULT_NOTE_SIZE, align: align ?? DEFAULT_NOTE_ALIGN, bold });
}

/**
 * `circle R1 red` の 1 行を読む (`notes:` に文字列で並べた項目)。
 * 指し先が部品 ID か番地かはここでは決めない (部品の表を持っていないため)。
 */
export function parseNoteLine(
  text: string,
  line: number,
  points: Points = NO_POINTS,
): Result<NoteSpec> {
  const tokens = text.trim().split(/\s+/).filter((token) => token.length > 0);
  const [kind, ...rest] = tokens;

  if (kind === undefined) return fail(`注釈の種類がありません (${noteKindList()} が使えます)`, line);
  if (kind === 'text') return fail(`text は ${TEXT_FORM} で書きます (文字は YAML の値にします)`, line);

  switch (kind) {
    case 'circle':
      return readCircleNote(rest, line);
    case 'box':
      return readBoxNote(rest, line, points);
    case 'arrow':
      return readArrowNote(rest, line);
    case 'source':
      return readSourceNote(rest, line, points);
    default:
      return fail(`注釈の種類 ${safeToken(kind)} は知りません (${noteKindList()} が使えます)`, line);
  }
}

/** 印に書けるのは指し先と色だけ。字の言葉を書いても効かないので、形を示して返す。 */
function readMarkColor(token: string | undefined, form: string, line: number): Result<string> {
  if (token === undefined) return ok(DEFAULT_MARK_COLOR);
  if (isNoteSize(token) || isNoteAlign(token) || token === BOLD_WORD) {
    return fail(`${form} で書きます (${safeToken(token)} は字の注釈にだけ書けます)`, line);
  }
  return readNoteColor(token, line);
}

function readCircleNote(rest: readonly string[], line: number): Result<NoteSpec> {
  const [target, colorToken, ...extra] = rest;
  if (target === undefined || extra.length > 0) return fail(`circle は ${CIRCLE_FORM} で書きます`, line);
  if (!isReferenceable(target)) return fail(notReferenceable(target), line);

  const color = readMarkColor(colorToken, `circle は ${CIRCLE_FORM}`, line);
  return color.ok ? ok({ kind: 'circle', target, color: color.value, line }) : color;
}

/**
 * `box a1 c3 blue` を読む。2 つの番地が枠の対角になる。
 * 同じ番地を 2 回書くのは書き間違いではない (1 マスだけを囲むということ)。
 */
function readBoxNote(rest: readonly string[], line: number, points: Points): Result<NoteSpec> {
  const [fromToken, toToken, colorToken, ...extra] = rest;
  if (fromToken === undefined || toToken === undefined || extra.length > 0) {
    return fail(`box は ${BOX_FORM} で書きます`, line);
  }

  const from = readAddress(fromToken, line, points);
  if (!from.ok) return from;
  const to = readAddress(toToken, line, points);
  if (!to.ok) return to;

  const color = readMarkColor(colorToken, `box は ${BOX_FORM}`, line);
  return color.ok ? ok({ kind: 'box', from: from.value, to: to.value, color: color.value, line }) : color;
}

/**
 * `arrow a5 R1 blue` を読む。両端とも部品 ID か番地で、
 * どちらかはここでは決めない (印と同じ扱い)。
 */
function readArrowNote(rest: readonly string[], line: number): Result<NoteSpec> {
  const [fromToken, toToken, colorToken, ...extra] = rest;
  if (fromToken === undefined || toToken === undefined || extra.length > 0) {
    return fail(`arrow は ${ARROW_FORM} で書きます`, line);
  }
  if (!isReferenceable(fromToken)) return fail(notReferenceable(fromToken), line);
  if (!isReferenceable(toToken)) return fail(notReferenceable(toToken), line);

  const color = readMarkColor(colorToken, `arrow は ${ARROW_FORM}`, line);
  return color.ok ? ok({ kind: 'arrow', from: fromToken, to: toToken, color: color.value, line }) : color;
}

const notReferenceable = (token: string): string =>
  `${safeToken(token)} は部品 ID にも番地にもなりません (英数字と _ - だけの ${LIMITS.idLength} 文字まで)`;

/**
 * `source a6 blue tiny` を読む。中身はフェンス自身から作るので、
 * ここでは場所と見た目だけ。見た目の言葉は字の注釈と同じものが使える。
 */
function readSourceNote(rest: readonly string[], line: number, points: Points): Result<NoteSpec> {
  const [atToken, ...words] = rest;
  if (atToken === undefined) return fail(`source は ${SOURCE_FORM} で書きます`, line);

  const at = readAddress(atToken, line, points);
  if (!at.ok) return at;

  const style = readTextStyle(words, line);
  return style.ok ? ok({ kind: 'source', at: at.value, ...style.value, line }) : style;
}

/**
 * `text b1 blue: ここで分圧する` を読む。`head` が `:` の左、`body` が右。
 * 字は的を問わず日本語まで通す (フェンスでは TeX に渡さないため。escape.ts)。
 */
export function parseNoteText(
  head: string,
  body: string,
  line: number,
  points: Points = NO_POINTS,
): Result<NoteSpec> {
  const tokens = head.trim().split(/\s+/).filter((token) => token.length > 0);
  const [kind, atToken, ...words] = tokens;

  if (kind !== 'text') {
    // `- box a1: c3` は YAML がマップとして読む。知っている種類なのに
    // 「種類を知りません」と返すと、直すのは種類ではないのに種類を疑わせる。
    const form = kind === undefined ? null : lineFormOf(kind);
    return form === null
      ? fail(`注釈の種類 ${safeToken(kind ?? '')} は知りません (${noteKindList()} が使えます)`, line)
      : fail(`${kind} は ${form} の 1 行で書きます (文字は付きません)`, line);
  }
  if (atToken === undefined) return fail(`text は ${TEXT_FORM} で書きます`, line);

  const at = readAddress(atToken, line, points);
  if (!at.ok) return at;

  if (body.trim().length === 0) return fail(`注釈の文字がありません (${TEXT_FORM} で書きます)`, line);
  if ([...body].length > LIMITS.noteLength) {
    return fail(`注釈の文字が長すぎます (${LIMITS.noteLength} 文字まで)`, line);
  }
  if (!isNoteDrawable(body)) {
    return fail(`注釈の文字に使えない文字があります (${NOTE_CHARSET} が使えます)`, line);
  }

  const style = readTextStyle(words, line);
  return style.ok ? ok({ kind: 'text', at: at.value, text: body, ...style.value, line }) : style;
}
