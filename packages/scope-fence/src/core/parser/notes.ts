import { isMap, isScalar, isSeq } from 'yaml';
import type { Node } from 'yaml';
import { isBareNumber, parseSeconds, parseVolts } from 'fence-kit';
import { dropInvisible, fenceError, safeToken } from '../errors.ts';
import { LIMITS } from '../limits.ts';
import { CHANNEL_NAMES } from '../model/channel.ts';
import type { ChannelName } from '../model/channel.ts';
import type { FenceError, NoteSpec } from '../types.ts';
import { fail, ok, wordsOf } from './result.ts';
import type { LineResult } from './result.ts';
import { scalarText, writtenText } from './yamlText.ts';

/**
 * 注釈 (`notes:`)。**種類と形は vna と同じ 4 つ**、番地だけが「時刻 電圧」
 * (52 の docs/99 決め 6)。
 *
 * - `- mark 1ms 1.26V` — 点に丸
 * - `- text 1ms 1.26V: 1 τ で 63 %` — 点に字
 * - `- band 0 1ms` / `- band 0 1ms: 充電` — 時刻の帯を塗る
 * - `- source` — フェンスの中身を図の下に書き出す
 *
 * **電圧はどの ch の V/div で読むか**が要る (ch ごとに尺度が違う)。書かなければ ch1、
 * `- text ch2 1ms 1.26V: …` のように ch を書けばその ch の V/div と基準で置く。
 * 時刻も電圧も単位が要る (素の数を受けるのは時刻の `0` だけ。文法の方針 1)。
 */

const HINT = '注釈は「- mark 1ms 1.26V」「- text 1ms 1.26V: 字」「- band 0 1ms: 字」「- source」の形で書きます';

const isChannelName = (text: string): text is ChannelName => (CHANNEL_NAMES as readonly string[]).includes(text);

/** 時刻 1 つ (`0` `1ms` `-500us`)。素の数は `0` だけ。 */
function readTime(text: string | undefined): LineResult<number> {
  const seconds = text === undefined ? null : parseSeconds(text);
  if (seconds !== null) return ok(seconds);
  const why = text !== undefined && isBareNumber(text) ? '時刻に単位がありません' : '時刻が読めません';
  return fail(`${why}: ${safeToken(text ?? '')} (0 / 1ms / -500us)`, text);
}

/** 電圧 1 つ (`1.26V` `-500mV`)。**素の数は断る**。 */
function readVolts(text: string | undefined): LineResult<number> {
  const read = text === undefined ? null : parseVolts(text);
  if (read !== null && read.kind === 'peak') return ok(read.volts);
  const why = text !== undefined && isBareNumber(text) ? '電圧に単位がありません' : '電圧が読めません';
  return fail(`${why}: ${safeToken(text ?? '')} (1.26V / -500mV)`, text);
}

/**
 * 図に載せる字は最後は `LIMITS.noteLength` に切るが、その前に見えない字を落とす正規表現も
 * 全コードポイントへの展開も**綴りの長さだけ重くなる** (`math.ts` の式の長さの断りと同じ理由)。
 * 削った先の字数を数えるより先に、十分すぎる余裕を残して生の綴りを切っておく。
 */
const NOTE_TEXT_BAIL = LIMITS.noteLength * 8;

/** 図に載せる字。見えない字を落とし、長さを切る。 */
const noteText = (body: string): string => {
  const short = body.length > NOTE_TEXT_BAIL ? body.slice(0, NOTE_TEXT_BAIL) : body;
  return [...dropInvisible(short).trim()].slice(0, LIMITS.noteLength).join('');
};

function readBand(words: readonly string[], text: string | null): LineResult<Omit<NoteSpec, 'line'>> {
  if (words.length !== 3) return fail('band は「band 0 1ms」(始めと終わりの時刻) の形で書きます', words[3] ?? words[0]);
  const from = readTime(words[1]);
  if (!from.ok) return from;
  const to = readTime(words[2]);
  if (!to.ok) return to;
  if (to.value <= from.value) return fail('band の終わりは始めより後にします', words[2]);
  return ok({ kind: 'band', from: from.value, to: to.value, text: text === '' ? null : text });
}

/** `mark` と `text` の番地 (`[ch2] 1ms 1.26V`)。 */
function readPoint(words: readonly string[]): LineResult<{ readonly channel: ChannelName; readonly t: number; readonly volts: number }> {
  if (words[1] === 'math') return fail('注釈は ch1〜ch4 の線の上に置きます (Math の上には置けません。番地の電圧は V)', 'math');
  const named = words[1] !== undefined && /^ch\d+$/.test(words[1]);
  if (named && !isChannelName(words[1] ?? '')) return fail('注釈の ch は ch1〜ch4 です', words[1]);
  const channel: ChannelName = named ? (words[1] as ChannelName) : 'ch1';
  const rest = words.slice(named ? 2 : 1);
  if (rest.length !== 2) return fail(`${words[0]} は「${words[0]} 1ms 1.26V」(時刻 電圧) の形で書きます`, rest[2] ?? words[0]);
  const t = readTime(rest[0]);
  if (!t.ok) return t;
  const volts = readVolts(rest[1]);
  if (!volts.ok) return volts;
  return ok({ channel, t: t.value, volts: volts.value });
}

/** `head` は `- ` の後ろ (字のある形ではコロンの前)、`body` はコロンの後ろ。 */
export function parseNoteLine(head: string, body: string | null): LineResult<Omit<NoteSpec, 'line'>> {
  const words = wordsOf(head);
  const kind = words[0] ?? '';
  const text = body === null ? null : noteText(body);
  if (kind === 'source') {
    if (words.length > 1 || body !== null) return fail('source の後ろには何も書きません (フェンスの中身をそのまま図の下に書き出します)', words[1] ?? 'source');
    return ok({ kind: 'source' });
  }
  if (kind === 'band') return readBand(words, text);
  if (kind !== 'mark' && kind !== 'text') return fail(HINT, kind || undefined);
  const point = readPoint(words);
  if (!point.ok) return point;
  if (kind === 'mark') return body === null ? ok({ kind: 'mark', ...point.value }) : fail('mark には字を書きません (字は text で)', 'mark');
  if (text === null || text === '') return fail('text はコロンの後ろに字を書きます (- text 1ms 1.26V: 字)', 'text');
  return ok({ kind: 'text', ...point.value, text });
}

type LineOf = (node: Node) => number | null;

/**
 * コロンの後ろの字。**書いたとおりの綴り** — YAML は `1.260` を `1.26`、`1e3` を `1000` に、
 * `true` を真偽に読むので、文字列でない値は元の字面から切り出す。何も無ければ空。
 */
function bodyOf(node: unknown, source: string): string | null {
  if (!isScalar(node)) return node === null || node === undefined ? '' : null;
  if (typeof node.value === 'string') return node.value;
  return writtenText(node, source) ?? '';
}

/** 1 項目 (`- mark …` のスカラーか、`- text …: 字` の 1 項目のマップ)。 */
function readItem(item: unknown, line: number | null, context: { readonly lineOf: LineOf; readonly source: string }): LineResult<NoteSpec> {
  const { lineOf, source } = context;
  const text = scalarText(item);
  if (text !== null) {
    const read = parseNoteLine(text, null);
    return read.ok ? ok({ ...read.value, line } as NoteSpec) : { ok: false, error: { ...read.error, line } };
  }
  const pair = isMap(item) && item.items.length === 1 ? item.items[0] : undefined;
  const head = scalarText(pair?.key);
  const body = pair === undefined ? null : bodyOf(pair.value, source);
  const at = (pair === undefined ? null : lineOf(pair.key as Node)) ?? line;
  if (head === null || body === null) return { ok: false, error: fenceError(HINT, at) };
  const read = parseNoteLine(head, body);
  return read.ok ? ok({ ...read.value, line: at } as NoteSpec) : { ok: false, error: { ...read.error, line: at } };
}

/** `notes:` の並びを読む。**上限を越えた分は言って捨てる**。 */
export function readNotes(value: unknown, keyLine: number | null, lineOf: LineOf, source: string): { readonly notes: readonly NoteSpec[]; readonly errors: readonly FenceError[] } {
  if (!isSeq(value)) return { notes: [], errors: [fenceError('notes: は `- text 1ms 1.26V: 字` のような並びにします', keyLine)] };
  const notes: NoteSpec[] = [];
  const errors: FenceError[] = [];
  for (const [index, item] of value.items.entries()) {
    const line = lineOf(item as Node);
    if (index >= LIMITS.notes) {
      errors.push(fenceError(`注釈が多すぎます (${LIMITS.notes} 個まで)`, line));
      break;
    }
    const read = readItem(item, line, { lineOf, source });
    if (read.ok) notes.push(read.value);
    else errors.push(read.error);
  }
  return { notes, errors };
}
