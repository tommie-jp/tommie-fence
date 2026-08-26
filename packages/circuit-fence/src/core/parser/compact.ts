import { fail, ok, safeToken } from '../errors.ts';
import { LIMITS, isReferenceable } from '../limits.ts';
import { formatAddress, isSameAddress, parseAddress } from '../model/address.ts';
import type { Address, WireOperator } from '../model/address.ts';
import { NOTE_COLOR_NAMES, noteColor } from '../notes.ts';
import { closestPartType, lookupPartType, partTypeNames } from '../parts.ts';
import { isNoteDrawable } from '../tex/escape.ts';
import type { Endpoint, NoteSpec, PartSpec, Result, WireSpec } from '../types.ts';

/** 配線の演算子。TikZ と同じ 3 つだけ (学習コストを増やさない)。 */
const WIRE_OPERATOR = /\s*(--|-\||\|-)\s*/;

const typeList = (): string => partTypeNames().join(' / ');

/** `U1.out` `Q1.B` の形。部品 ID と足の名前を分ける。 */
const PIN_REFERENCE = /^([\w-]+)\.([^\s.]+)$/;

/** 書ける向き。今のところオペアンプの ± の上下だけ。 */
export const ORIENTATIONS = ['+up', '+down'] as const;

const readAddress = (token: string, line: number): Result<Address> => {
  const address = parseAddress(token);
  return address === null
    ? fail(`${safeToken(token)} は番地の形ではありません (行 a〜z + 列 1〜${LIMITS.columns})`, line)
    : ok(address);
};

/**
 * `resistor a1 a3 10k` の 1 行を読む。
 * 両端が斜めでも通す (circuitikz は任意の角度に引ける)。同じ番地どうしだけは
 * 向きも長さも決まらないので通さない。
 */
export function parseCompactPart(id: string, text: string, line: number): Result<PartSpec> {
  const tokens = text.trim().split(/\s+/).filter((token) => token.length > 0);
  const [typeName, ...rest] = tokens;

  if (typeName === undefined) {
    return fail(`部品 ${safeToken(id)} の種類がありません (${typeList()} が使えます)`, line);
  }

  const type = lookupPartType(typeName);
  if (type === null) {
    // 種類が増えるほど羅列は読みにくいので、近いものがあればそれだけを添える。
    const closest = closestPartType(typeName);
    const hint = closest === null ? `${typeList()} が使えます` : `${closest} のことですか?`;
    return fail(`種類 ${safeToken(typeName)} は知りません (${hint})`, line);
  }

  if (type.kind === 'two-terminal') return readTwoTerminal(id, typeName, rest, line);
  return type.kind === 'one-terminal'
    ? readOneTerminal(id, typeName, rest, line)
    : readMultiTerminal(id, typeName, rest, line);
}

/**
 * `Q1: npn d8 2SC1815` / `U1: opamp c5 +up` の形。
 * 番地のあとに来るのは向きか値。向きは決まった語なので見分けられる。
 */
function readMultiTerminal(id: string, typeName: string, rest: string[], line: number): Result<PartSpec> {
  const [atToken, ...extra] = rest;
  if (atToken === undefined) {
    return fail(`${safeToken(typeName)} は「種類 番地 [向き] [型番]」で書きます`, line);
  }

  const at = readAddress(atToken, line);
  if (!at.ok) return at;

  let orientation: string | null = null;
  let value: string | null = null;

  for (const token of extra) {
    if ((ORIENTATIONS as readonly string[]).includes(token)) {
      orientation = token;
      continue;
    }
    if (value !== null) {
      return fail(`${safeToken(typeName)} は「種類 番地 [向き] [型番]」で書きます`, line);
    }
    if ([...token].length > LIMITS.valueLength) {
      return fail(`値が長すぎます (${LIMITS.valueLength} 文字まで)`, line);
    }
    value = token;
  }

  return ok({ kind: 'multi-terminal', id, type: typeName, at: at.value, value, orientation, line });
}

function readTwoTerminal(id: string, typeName: string, rest: string[], line: number): Result<PartSpec> {
  const [fromToken, toToken, value, ...extra] = rest;

  if (fromToken === undefined || toToken === undefined || extra.length > 0) {
    return fail(`${safeToken(typeName)} は「種類 番地 番地 [値]」で書きます`, line);
  }

  const from = readAddress(fromToken, line);
  if (!from.ok) return from;
  const to = readAddress(toToken, line);
  if (!to.ok) return to;

  if (isSameAddress(from.value, to.value)) {
    return fail(`${safeToken(typeName)} の両端が同じ番地です (${formatAddress(from.value)})`, line);
  }
  if (value !== undefined && [...value].length > LIMITS.valueLength) {
    return fail(`値が長すぎます (${LIMITS.valueLength} 文字まで)`, line);
  }

  return ok({
    kind: 'two-terminal',
    id,
    type: typeName,
    from: from.value,
    to: to.value,
    value: value ?? null,
    line,
  });
}

function readOneTerminal(id: string, typeName: string, rest: string[], line: number): Result<PartSpec> {
  const [atToken, ...extra] = rest;

  if (atToken === undefined || extra.length > 0) {
    return fail(`${safeToken(typeName)} は「種類 番地」で書きます`, line);
  }

  const at = readAddress(atToken, line);
  if (!at.ok) return at;

  return ok({ kind: 'one-terminal', id, type: typeName, at: at.value, line });
}

/**
 * `a3 -- a4` の 1 行を読む。演算子は TikZ と同じ 3 つ。
 *
 * - `--` まっすぐ。端点が揃っていなくてもそのまま斜めに引く (勝手に折らない)
 * - `-|` 先に横、それから縦
 * - `|-` 先に縦、それから横
 */
export function parseWireSpec(text: string, line: number): Result<WireSpec> {
  const parts = text.trim().split(WIRE_OPERATOR);

  if (parts.length !== 3) {
    return fail('配線は「端点 -- 端点」で書きます', line);
  }

  const [fromToken = '', operator = '', toToken = ''] = parts;

  const from = readEndpoint(fromToken, line);
  if (!from.ok) return from;
  const to = readEndpoint(toToken, line);
  if (!to.ok) return to;

  if (
    from.value.kind === 'cell' &&
    to.value.kind === 'cell' &&
    isSameAddress(from.value.address, to.value.address)
  ) {
    return fail(`配線の両端が同じ番地です (${formatAddress(from.value.address)})`, line);
  }

  return ok({ from: from.value, to: to.value, operator: operator as WireOperator, line });
}

/** 配線の端。`a3` のような番地か、`U1.out` のような足。 */
function readEndpoint(token: string, line: number): Result<Endpoint> {
  const pin = PIN_REFERENCE.exec(token);
  if (pin) {
    const [, part = '', name = ''] = pin;
    return ok({ kind: 'pin', part, pin: name });
  }

  const address = readAddress(token, line);
  return address.ok ? ok({ kind: 'cell', address: address.value }) : address;
}

/** 注釈の種類。印 (`circle`) と字 (`text`) の 2 つだけ。 */
const NOTE_KINDS = ['circle', 'text'] as const;

/** 印の既定の色。目立たせるために書くものなので、書かなければ赤。 */
const DEFAULT_CIRCLE_COLOR = 'red';

/** 注釈の字に使える字。escape.ts の関門と対にして書く (片方だけ増やさない)。 */
const NOTE_CHARSET = '英数字と . + - / ( ) _ % : 、日本語、µ Ω °';

/**
 * 字は YAML の値として書く。**フェンスの側で引用符を決めない**のは、
 * YAML のプレーンスカラーに `: ` を書けないため (`- text b1 "R1: resistor"` は
 * 黙ってマップになり、エラーにもならない)。値にすれば引用は YAML の仕事になる。
 */
const TEXT_FORM = '「- text 番地 [色]: 文字」';
const CIRCLE_FORM = '「- circle 部品IDか番地 [色]」';

const noteKindList = (): string => NOTE_KINDS.join(' / ');

const readNoteColor = (token: string, line: number): Result<string> =>
  noteColor(token) === null
    ? fail(`注釈の色 ${safeToken(token)} は知りません (${NOTE_COLOR_NAMES.join(' / ')} が使えます)`, line)
    : ok(token);

/**
 * `circle R1 red` の 1 行を読む (`notes:` に文字列で並べた項目)。
 * 指し先が部品 ID か番地かはここでは決めない (部品の表を持っていないため)。
 */
export function parseNoteLine(text: string, line: number): Result<NoteSpec> {
  const tokens = text.trim().split(/\s+/).filter((token) => token.length > 0);
  const [kind, ...rest] = tokens;

  if (kind === undefined) return fail(`注釈の種類がありません (${noteKindList()} が使えます)`, line);
  if (kind === 'text') return fail(`text は ${TEXT_FORM} で書きます (文字は YAML の値にします)`, line);
  if (kind !== 'circle') {
    return fail(`注釈の種類 ${safeToken(kind)} は知りません (${noteKindList()} が使えます)`, line);
  }

  const [target, colorToken, ...extra] = rest;
  if (target === undefined || extra.length > 0) return fail(`circle は ${CIRCLE_FORM} で書きます`, line);
  if (!isReferenceable(target)) {
    return fail(
      `${safeToken(target)} は部品 ID にも番地にもなりません (英数字と _ - だけの ${LIMITS.idLength} 文字まで)`,
      line,
    );
  }

  const color = colorToken === undefined ? ok(DEFAULT_CIRCLE_COLOR) : readNoteColor(colorToken, line);
  if (!color.ok) return color;

  return ok({ kind: 'circle', target, color: color.value, line });
}

/**
 * `text b1 blue: ここで分圧する` を読む。`head` が `:` の左、`body` が右。
 * 字は的を問わず日本語まで通す (フェンスでは TeX に渡さないため。escape.ts)。
 */
export function parseNoteText(head: string, body: string, line: number): Result<NoteSpec> {
  const tokens = head.trim().split(/\s+/).filter((token) => token.length > 0);
  const [kind, atToken, colorToken, ...extra] = tokens;

  if (kind !== 'text') {
    return kind === 'circle'
      ? fail(`circle は ${CIRCLE_FORM} の 1 行で書きます (文字は付きません)`, line)
      : fail(`注釈の種類 ${safeToken(kind ?? '')} は知りません (${noteKindList()} が使えます)`, line);
  }
  if (atToken === undefined || extra.length > 0) return fail(`text は ${TEXT_FORM} で書きます`, line);

  const at = readAddress(atToken, line);
  if (!at.ok) return at;

  if (body.trim().length === 0) return fail(`注釈の文字がありません (${TEXT_FORM} で書きます)`, line);
  if ([...body].length > LIMITS.noteLength) {
    return fail(`注釈の文字が長すぎます (${LIMITS.noteLength} 文字まで)`, line);
  }
  if (!isNoteDrawable(body)) {
    return fail(`注釈の文字に使えない文字があります (${NOTE_CHARSET} が使えます)`, line);
  }

  const color: Result<string | null> = colorToken === undefined ? ok(null) : readNoteColor(colorToken, line);
  if (!color.ok) return color;

  return ok({ kind: 'text', at: at.value, text: body, color: color.value, line });
}
