import { isMap, isScalar, isSeq } from 'yaml';
import type { Node, Pair } from 'yaml';
import { fail, ok, safeToken } from '../errors.ts';
import { LIMITS } from '../limits.ts';
import { IC3, MAP_TYPES, NO_TURN } from '../parts.ts';
import type { Turn } from '../parts.ts';
import type { PartSpec, Result } from '../types.ts';
import { readAddress, readTurnWords } from './compact.ts';
import type { Points } from './compact.ts';

/**
 * 機器 (`device`) のマップ形式。**実体配線図の 2 つと同じ書き方**にしてある
 * (52 の docs/66 の段 1) — 同じ回路を 3 つのフェンスで書くとき、機器だけ
 * 書き方を覚え直さなくてよいように。
 *
 * ```yaml
 * M1:
 *   type: device
 *   at: d5
 *   label: HC-SR04
 *   pins: [VCC, TRIG, ECHO, GND]
 *   turn: mirror
 * ```
 *
 * 1 行形式は種類と番地と値を空白で並べるが、足の名前の並びは 1 行に畳めない。
 *
 * **3 本足の IC (`type: ic3`) も同じ形で書く** — 足の名前が品ごとに違うので、
 * 書き手が並べる (`pins: [+Vs, Vout, GND]`)。本数は 3 本ちょうど。
 */

type LineOf = (node: Node | Pair | null | undefined) => number | null;

/** マップ形式で書ける鍵。 */
const KEYS = ['type', 'at', 'label', 'pins', 'turn'] as const;

/**
 * 足の名前に使える字。**配線の端 (`M1.TRIG`) に書ける綴り**に絞る — `.` は部品と
 * 足の区切り、空白は端点の区切りなので入れられない。`+` `-` は `V+` `1-` のために通す。
 */
const PIN_NAME = /^[\w+-]+$/;

/** 数字だけの名前は番号 (`M1.2`) と取り違えるので断る。 */
const DIGITS = /^\d+$/;

const MIN_PINS = 2;

/** 3 本足の IC の足の本数。 */
const IC3_PINS = 3;

const textOf = (node: unknown): string | null => {
  if (!isScalar(node)) return null;
  const { value } = node;
  return typeof value === 'string' || typeof value === 'number' ? String(value) : null;
};

export function parseDevicePart(
  id: string,
  node: unknown,
  line: number,
  lineOf: LineOf,
  points: Points,
): Result<PartSpec> {
  if (!isMap(node)) return fail(`部品 ${safeToken(id)} の中身が読めません`, line);

  const fields = new Map<string, { readonly value: unknown; readonly line: number }>();
  for (const pair of node.items) {
    const key = textOf(pair.key);
    const at = lineOf(pair.key as Node) ?? line;
    if (key === null || !(KEYS as readonly string[]).includes(key)) {
      return fail(`部品 ${safeToken(id)} に ${safeToken(key ?? '?')} は書けません (${KEYS.join(' / ')})`, at, key ?? undefined);
    }
    fields.set(key, { value: pair.value, line: at });
  }

  const type = textOf(fields.get('type')?.value);
  if (type === null || !MAP_TYPES.includes(type)) {
    return fail(
      `マップ形式で書けるのは type: ${MAP_TYPES.join(' / ')} だけです。ほかの部品は「${safeToken(id)}: 種類 番地 …」の 1 行で書きます`,
      // 指すのは部品の ID の行 (1 行形式で書き直す行)。
      line,
    );
  }

  const atField = fields.get('at');
  const atToken = textOf(atField?.value);
  if (atField === undefined || atToken === null) return fail(`部品 ${safeToken(id)} の置き場 (at: 番地) を書きます`, line);
  const at = readAddress(atToken, atField.line, points);
  if (!at.ok) return at;

  const pins = readPins(id, fields.get('pins'), line);
  if (!pins.ok) return pins;
  if (type === IC3 && pins.value.length !== IC3_PINS) {
    return fail(`${IC3} の足は ${IC3_PINS} 本です (1 = 左、2 = 下、3 = 右の順に名前を並べます)`, fields.get('pins')?.line ?? line);
  }

  const labelField = fields.get('label');
  const label = labelField === undefined ? null : textOf(labelField.value);
  if (labelField !== undefined && label === null) return fail(`部品 ${safeToken(id)} の label は字で書きます`, labelField.line);
  if (label !== null && [...label].length > LIMITS.valueLength) {
    return fail(`label が長すぎます (${LIMITS.valueLength} 文字まで)`, labelField?.line ?? line);
  }

  const turnField = fields.get('turn');
  let turn: Turn = NO_TURN;
  if (turnField !== undefined) {
    const words = textOf(turnField.value);
    if (words === null) return fail(`部品 ${safeToken(id)} の turn は向きの語で書きます`, turnField.line);
    const read = readTurnWords(type, words.trim().split(/\s+/), turnField.line);
    if (!read.ok) return read;
    turn = read.value;
  }

  return ok({
    kind: 'multi-terminal', id, type, at: at.value, value: label,
    orientation: null, turn, line, pinNames: pins.value,
    spelling: [atToken], written: type,
  });
}

function readPins(
  id: string,
  field: { readonly value: unknown; readonly line: number } | undefined,
  line: number,
): Result<readonly string[]> {
  if (field === undefined) return fail(`部品 ${safeToken(id)} の足の名前 (pins: [名前, …]) を書きます`, line);
  if (!isSeq(field.value)) return fail('pins は [VCC, GND] のように名前を並べて書きます', field.line);

  const names: string[] = [];
  const seen = new Set<string>();
  for (const item of field.value.items) {
    const name = textOf(item);
    if (name === null || !PIN_NAME.test(name) || name.length > LIMITS.idLength) {
      return fail(
        `足の名前 ${safeToken(name ?? '?')} は使えません (英数字と _ + - だけの ${LIMITS.idLength} 文字まで)`,
        field.line, name ?? undefined,
      );
    }
    if (DIGITS.test(name)) {
      return fail(`足の名前 ${safeToken(name)} は数字だけなので使えません (番号は ${safeToken(id)}.${name} で指せます)`, field.line, name);
    }
    if (seen.has(name.toLowerCase())) {
      return fail(`足の名前 ${safeToken(name)} が 2 回あります (大文字小文字は区別しません)`, field.line, name);
    }
    seen.add(name.toLowerCase());
    names.push(name);
  }

  if (names.length < MIN_PINS) return fail(`足は ${MIN_PINS} 本から書けます`, field.line);
  if (names.length > LIMITS.devicePins) return fail(`足は ${LIMITS.devicePins} 本までです`, field.line);
  return ok(names);
}
