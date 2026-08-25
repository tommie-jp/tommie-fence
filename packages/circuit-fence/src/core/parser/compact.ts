import { fail, ok, safeToken } from '../errors.ts';
import { LIMITS } from '../limits.ts';
import { formatAddress, isSameAddress, parseAddress } from '../model/address.ts';
import type { Address, WireOperator } from '../model/address.ts';
import { closestPartType, lookupPartType, partTypeNames } from '../parts.ts';
import type { Endpoint, PartSpec, Result, WireSpec } from '../types.ts';

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
