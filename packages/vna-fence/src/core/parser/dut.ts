import { isBareNumber } from 'fence-kit';
import { safeToken } from '../errors.ts';
import type { DutBody, LineSpec, LumpedSpec, Place } from '../model/dut.ts';
import { fail, ok, wordsOf } from './result.ts';
import type { LineResult } from './result.ts';
import { parseLength, parseNumber, parseReactive, parseResistance } from './values.ts';

/**
 * `dut:` の 1 行。
 *
 * - `series R 100` / `shunt C 47p` — 集中定数 (置き方を省くと series)
 * - `series C 10p esr 0.2 esl 1n` / `series L 100n cp 0.5p` — 寄生分つき
 * - `series L 100n rp 300 cp 2p esr 0.3` — `rp` は `cp` と同じく全体に並列の抵抗 (フェライトビーズ)
 * - `line 50 1m vf 0.66` — 伝送線路。`shunt line 50 12.5cm open` はスタブ
 * - `open` / `short` — 模型の終わり (CH1 には繋がない)
 */

const HINT = 'dut: の素子は「series R 100」「shunt C 47p」「line 50 1m vf 0.66」「open」の形で書きます';

/** 値の範囲。外は書き間違い (`C 2F` や `L 100` 相当)。素の数の L・C は範囲より先に断る。 */
const RANGES = {
  R: { min: 0, max: 1e9, say: '0〜1GΩ' },
  L: { min: 1e-15, max: 10, say: '1fH〜10H' },
  C: { min: 1e-18, max: 1, say: '1aF〜1F' },
} as const;

const PARASITES = ['esr', 'esl', 'cp', 'rp'] as const;

/** `rp` の範囲。0 Ω は本体を短絡するので断る (並列に 0 Ω を書く意味が無い)。 */
const RP_MAX = 1e9;

function readValue(part: 'R' | 'L' | 'C', text: string): number | null {
  const value = part === 'R' ? parseResistance(text) : parseReactive(text, part === 'L' ? 'H' : 'F');
  if (value === null) return null;
  const range = RANGES[part];
  return value < range.min || value > range.max ? null : value;
}

const unitHint = (part: 'R' | 'L' | 'C'): string =>
  (part === 'R' ? '100 / 4k7 / 1M' : part === 'L' ? '100n / 1u / 2.2µ' : '47p / 100n / 0.1u');

function readLumped(place: Place, part: 'R' | 'L' | 'C', words: readonly string[]): LineResult<LumpedSpec> {
  const [valueText, ...rest] = words;
  if (valueText === undefined) return fail(`${part} の値を書きます (例: ${unitHint(part)})`);
  if (part !== 'R' && isBareNumber(valueText)) {
    return fail(`${part} の値に接頭辞がありません: ${safeToken(valueText)} (例: ${unitHint(part)}。単位だけなら 1${part === 'L' ? 'H' : 'F'})`, valueText);
  }
  const value = readValue(part, valueText);
  if (value === null) {
    return fail(`${part} の値が読めません: ${safeToken(valueText)} (例: ${unitHint(part)}。${RANGES[part].say})`, valueText);
  }
  const parasites = { esr: 0, esl: 0, cp: 0, rp: 0 };
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index] ?? '';
    const text = rest[index + 1];
    if (!(PARASITES as readonly string[]).includes(key)) {
      return fail(`知らない寄生分です: ${safeToken(key)} (${PARASITES.join(' / ')})`, key);
    }
    if (text === undefined) return fail(`${key} の値を書きます`, key);
    if (key === 'rp') {
      const ohms = parseResistance(text);
      if (ohms === null || ohms <= 0 || ohms > RP_MAX) {
        return fail(`rp の値が読めません: ${safeToken(text)} (全体に並列の抵抗。例: 300 / 4k7。0 Ω より大きく 1GΩ まで)`, text);
      }
      parasites.rp = ohms;
      continue;
    }
    if (key !== 'esr' && isBareNumber(text)) {
      return fail(`${key} の値に接頭辞がありません: ${safeToken(text)} (例: ${key === 'esl' ? '1n / 0.5n' : '0.5p / 2p'})`, text);
    }
    const read = key === 'esr' ? parseResistance(text) : parseReactive(text, key === 'esl' ? 'H' : 'F');
    if (read === null) return fail(`${key} の値が読めません: ${safeToken(text)}`, text);
    parasites[key as 'esr' | 'esl' | 'cp'] = read;
  }
  return ok({ kind: 'lumped', place, part, value, ...parasites });
}

function readLine(place: Place, words: readonly string[]): LineResult<LineSpec> {
  const [z0Text, lengthText, ...rest] = words;
  const z0 = z0Text === undefined ? null : parseNumber(z0Text);
  if (z0 === null || z0 < 1 || z0 > 1000) return fail('line は「line Z0 長さ」で書きます (例: line 50 1m vf 0.66。Z0 は 1〜1000 Ω)', z0Text);
  const length = lengthText === undefined ? null : parseLength(lengthText);
  if (length === null || length > 1000) return fail('線路の長さは単位を付けて書きます (1m / 25cm / 300mm。1000m まで)', lengthText);
  let vf = 1;
  let end: 'open' | 'short' | null = null;
  for (let index = 0; index < rest.length; index += 1) {
    const word = rest[index] ?? '';
    if (word === 'open' || word === 'short') {
      end = word;
      continue;
    }
    if (word === 'vf') {
      const read = parseNumber(rest[index + 1] ?? '');
      if (read === null || read < 0.1 || read > 1) return fail('vf (速度係数) は 0.1〜1 で書きます', 'vf');
      vf = read;
      index += 1;
      continue;
    }
    return fail(`line の後ろの ${safeToken(word)} が読めません (vf 0.66 / open / short)`, word);
  }
  if (place === 'shunt' && end === null) {
    return fail('並列の線路はスタブです。先を open か short で書きます (例: shunt line 50 12.5cm open)');
  }
  return ok({ kind: 'line', place, z0, length, vf, end });
}

export function parseDutLine(text: string): LineResult<DutBody> {
  const words = wordsOf(text);
  const first = (words[0] ?? '').toLowerCase();
  if (first === 'open' || first === 'short') {
    if (words.length > 1) return fail(`${first} の後ろには何も書きません`, words[1]);
    return ok({ kind: 'end', end: first });
  }
  const placed = first === 'series' || first === 'shunt';
  const place: Place = first === 'shunt' ? 'shunt' : 'series';
  const [partWord, ...rest] = placed ? words.slice(1) : words;
  if (partWord === undefined) return fail(HINT);
  if (partWord.toLowerCase() === 'line') return readLine(place, rest);
  const part = partWord.toUpperCase();
  if (part !== 'R' && part !== 'L' && part !== 'C') {
    return fail(`知らない素子です: ${safeToken(partWord)} (R / L / C / line / open / short)`, partWord);
  }
  return readLumped(place, part, rest);
}
