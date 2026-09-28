import { dropInvisible, safeToken } from '../errors.ts';
import { LIMITS } from '../limits.ts';
import { parseNumber, parseQuantity } from '../model/quantity.ts';
import type { NoteSpec } from '../types.ts';
import { fail, ok, wordsOf } from './result.ts';
import type { LineResult } from './result.ts';

/**
 * 注釈。**番地は軸の値** — x は軸の単位 (付けても付けなくてもよい)、y は単位つきで、
 * **単位でどの枠に置くかが決まる** (`level -3dB` は dB の枠。枠が 1 つなら単位は省ける)。
 *
 * - `- mark 1.59k` — 縦線と、各線の読み値 (帯と check に出る)
 * - `- level -3dB` — 横の破線
 * - `- band 14k 18k` / `- band 14k 18k: 字` — x の帯を塗る
 * - `- text 16k 27mA: 字` — 点に字
 * - `- peak` — 全部の線の頂点に印と読み値
 * - `- source` — フェンスの中身を図の下に書き出す
 */

const HINT = '注釈は「- mark 1.59k」「- level -3dB」「- band 14k 18k: 字」「- text 16k 27mA: 字」「- peak」「- source」の形で書きます';

/** y の値と単位 (`-3dB` → −3 と dB、`0.707` → 0.707 と単位無し)。 */
export function splitValue(text: string): { readonly value: number; readonly unit: string | null } | null {
  const bare = parseNumber(text);
  if (bare !== null) return { value: bare, unit: null };
  // 単位の頭が接頭辞の字 (`27mA`) か、数に接頭辞が付いた (`27m` + `A`) かは決められない。
  // **数の後ろを全部単位**として採り、枠の単位と照らすのは呼ぶ側 (見つからなければ言う)。
  const found = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)(.+)$/.exec(text.trim());
  const value = parseNumber(found?.[1] ?? '');
  const unit = found?.[2] ?? '';
  return value === null || unit === '' ? null : { value, unit };
}

/** `head` は `- ` の後ろ (字のある形ではコロンの前)、`body` はコロンの後ろ。`xUnit` は横軸の単位。 */
export function parseNoteLine(head: string, body: string | null, xUnit: string): LineResult<Omit<NoteSpec, 'line'>> {
  const words = wordsOf(head);
  const kind = (words[0] ?? '').toLowerCase();
  // 見えない字 (bidi・幅 0) は図に刷る前に落とす。
  const text = body === null ? null : [...dropInvisible(body).trim()].slice(0, LIMITS.noteLength).join('');
  const readX = (word: string | undefined): LineResult<number> => {
    const read = parseQuantity(word ?? '', xUnit);
    return read.ok ? ok(read.value) : fail(`x が読めません: ${safeToken(word ?? '')} (${read.reason})`, word);
  };

  if (kind === 'source' || kind === 'peak') {
    if (words.length > 1 || body !== null) return fail(`${kind} の後ろには何も書きません`, words[1]);
    return ok({ kind });
  }
  if (kind === 'mark') {
    if (words.length !== 2 || body !== null) return fail('mark は「- mark 1.59k」の形で書きます (字は text で)', words[2]);
    const x = readX(words[1]);
    return x.ok ? ok({ kind: 'mark', x: x.value }) : x;
  }
  if (kind === 'level') {
    if (words.length !== 2 || body !== null) return fail('level は「- level -3dB」の形で書きます', words[2]);
    const read = splitValue(words[1] ?? '');
    if (read === null) return fail(`値が読めません: ${safeToken(words[1] ?? '')} (-3dB / 0.707)`, words[1]);
    return ok({ kind: 'level', y: read.value, unit: read.unit });
  }
  if (kind === 'band') {
    if (words.length !== 3) return fail('band は「- band 14k 18k」の形で書きます', words[1]);
    const from = readX(words[1]);
    if (!from.ok) return from;
    const to = readX(words[2]);
    if (!to.ok) return to;
    if (to.value <= from.value) return fail('band の終わりは始めより大きくします', words[2]);
    return ok({ kind: 'band', from: from.value, to: to.value, text: text === '' ? null : text });
  }
  if (kind === 'text') {
    if (words.length !== 3) return fail('text は「- text 16k 27mA: 字」の形で書きます', words[1]);
    const x = readX(words[1]);
    if (!x.ok) return x;
    const read = splitValue(words[2] ?? '');
    if (read === null) return fail(`値が読めません: ${safeToken(words[2] ?? '')} (27mA / -20dB / 0.5)`, words[2]);
    if (text === null || text === '') return fail('text はコロンの後ろに字を書きます (- text 16k 27mA: 字)');
    return ok({ kind: 'text', x: x.value, y: read.value, unit: read.unit, text });
  }
  return fail(HINT, words[0]);
}
