import { safeToken } from '../errors.ts';
import { LIMITS } from '../limits.ts';
import { parseHertz } from '../model/frequency.ts';
import type { NoteSpec, NoteUnit } from '../types.ts';
import { fail, ok, wordsOf } from './result.ts';
import type { LineResult } from './result.ts';

/**
 * 注釈。**番地は「周波数 値」** — 値の単位でどの枠に置くかが決まる
 * (`-20dB` は dB の枠、`45deg` は位相、`1.2ns` は群遅延、`50Ω` は R / X / |Z|、
 * 単位の無い数は SWR か linear)。
 *
 * - `- mark 100M -6dB` — 点に丸
 * - `- text 100M -20dB: 治具の限界` — 点に字
 * - `- band 88M 108M` / `- band 88M 108M: FM 放送` — 周波数の帯を塗る
 * - `- source` — フェンスの中身を図の下に書き出す
 */

const UNITS: readonly (readonly [RegExp, NoteUnit])[] = [
  [/^(-?\d+(?:\.\d+)?)dB$/i, 'dB'],
  [/^(-?\d+(?:\.\d+)?)(?:deg|°)$/i, 'deg'],
  [/^(-?\d+(?:\.\d+)?)ns$/i, 'ns'],
  [/^(-?\d+(?:\.\d+)?)(?:Ω|ohm)$/iu, 'ohm'],
  [/^(-?\d+(?:\.\d+)?)$/, 'none'],
];

function readValue(text: string): { value: number; unit: NoteUnit } | null {
  for (const [pattern, unit] of UNITS) {
    const found = pattern.exec(text);
    if (found !== null) return { value: Number(found[1]), unit };
  }
  return null;
}

const HINT = '注釈は「- mark 100M -6dB」「- text 100M -20dB: 字」「- band 88M 108M」「- source」の形で書きます';

/** `head` は `- ` の後ろ (字のある形ではコロンの前)、`body` はコロンの後ろ。 */
export function parseNoteLine(head: string, body: string | null): LineResult<Omit<NoteSpec, 'line'>> {
  const words = wordsOf(head);
  const kind = (words[0] ?? '').toLowerCase();
  const text = body === null ? null : [...body.trim()].slice(0, LIMITS.noteLength).join('');

  if (kind === 'source') {
    if (words.length > 1 || body !== null) return fail('source の後ろには何も書きません', words[1]);
    return ok({ kind: 'source' });
  }
  if (kind === 'band') {
    const from = parseHertz(words[1] ?? '');
    const to = parseHertz(words[2] ?? '');
    if (from === null || to === null || words.length > 3) return fail('band は「band 88M 108M」の形で書きます', words[1]);
    if (to <= from) return fail('band の終わりは始めより上にします', words[2]);
    return ok({ kind: 'band', from, to, text: text === '' ? null : text });
  }
  if (kind !== 'mark' && kind !== 'text') return fail(HINT, words[0]);
  const f = parseHertz(words[1] ?? '');
  if (f === null) return fail(`周波数が読めません: ${safeToken(words[1] ?? '')} (100M / 2.4G)`, words[1]);
  const read = readValue(words[2] ?? '');
  if (read === null || words.length > 3) {
    return fail(`値が読めません: ${safeToken(words[2] ?? '')} (-20dB / 45deg / 1.2ns / 50Ω / 2)`, words[2]);
  }
  if (kind === 'mark') {
    if (body !== null) return fail('mark には字を書きません (字は text で)');
    return ok({ kind: 'mark', f, ...read });
  }
  if (text === null || text === '') return fail('text はコロンの後ろに字を書きます (- text 100M -20dB: 字)');
  return ok({ kind: 'text', f, ...read, text });
}
