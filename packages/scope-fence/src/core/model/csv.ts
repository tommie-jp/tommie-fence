import { normalizeNewlines } from 'fence-kit';
import { LIMITS, clampText } from '../limits.ts';
import { CHANNEL_NAMES } from './channel.ts';
import type { ChannelName } from './channel.ts';

/**
 * WaveForms の Scope の Export (CSV / TXT) を読む。**描くのは数だけ** — `#` の頭書き
 * (機種・日時・トリガの設定) は読み捨てる (字は図に出さない。エスケープの前に出さないのが一番安い)。
 *
 * - 区切りは `,` か タブ (`.txt`) か `;`。最初の字を含む行が見出し:
 *   `Time (s)` と `Channel 1 (V)` / `C1 (V)` / `CH1 (V)` (`(mV)` も)。見出しが無ければ 2 列目から ch1 …
 * - `Channel N` の N で chN に当てる。`Math 1 (V)` は読み捨てて言う
 * - 時刻は `(s)` `(ms)` `(us)`。**単調に増え、間隔が揃っている**こと (Record の分割は断る)
 * - 小数点はピリオドだけ (ロケールのコンマは断る — 黙って別の値に読まない)
 */
export type CsvColumn = { readonly name: ChannelName; readonly values: Float64Array };

export type CsvRead =
  | {
    readonly ok: true;
    readonly time: Float64Array;
    /** 点の間隔 (s)。 */
    readonly dt: number;
    readonly columns: readonly CsvColumn[];
    /** 読み捨てた列など、読めたが言っておくこと。 */
    readonly notes: readonly string[];
  }
  | { readonly ok: false; readonly reason: string };

const refuse = (reason: string): CsvRead => ({ ok: false, reason });

const TIME_UNITS: Readonly<Record<string, number>> = { s: 1, ms: 1e-3, us: 1e-6, µs: 1e-6 };
const TIME = /^Time\s*\((s|ms|us|µs)\)$/i;
const CHANNEL = /^(?:Channel|CH|C)\s*(\d+)\s*\((m?V)\)$/i;
const DECIMAL_COMMA = /^[+-]?\d+,\d+$/;
/** 見出しと値の並びを見分ける (数と区切りと指数の e しか無ければ値の行)。 */
const VALUES_ONLY = /^[\s\d.,;+\-eE]*$/;

type Column = { readonly name: ChannelName; readonly scale: number } | null;

type Heading = { readonly timeScale: number; readonly columns: readonly Column[]; readonly notes: readonly string[] } | { readonly reason: string };

function readHeading(cells: readonly string[]): Heading {
  const [first = '', ...rest] = cells.map((cell) => cell.trim());
  const time = TIME.exec(first);
  if (time === null) return { reason: '1 列目は Time (s) にします (WaveForms の書き出しと同じ)' };
  const notes: string[] = [];
  const seen = new Set<ChannelName>();
  const columns: Column[] = [];
  for (const cell of rest) {
    const shown = clampText(cell, LIMITS.idLength);
    const channel = CHANNEL.exec(cell);
    if (channel === null) {
      notes.push(/^Math/i.test(cell) ? `${shown} の列は読み捨てました (Math は描きません)` : `${shown} の列は読み捨てました`);
      columns.push(null);
      continue;
    }
    const name = CHANNEL_NAMES[Number(channel[1]) - 1];
    if (name === undefined) return { reason: `${shown} の列は ch1〜ch4 に当たりません` };
    if (seen.has(name)) return { reason: `${name} の列が 2 つあります` };
    seen.add(name);
    columns.push({ name, scale: channel[2]?.toLowerCase() === 'mv' ? 1e-3 : 1 });
  }
  return { timeScale: TIME_UNITS[(time[1] ?? 's').replace('µ', 'u').toLowerCase()] ?? 1, columns, notes };
}

const delimiterOf = (line: string): string => (line.includes('\t') ? '\t' : line.includes(';') ? ';' : ',');

export function parseCsv(input: string): CsvRead {
  const lines = normalizeNewlines(input).split('\n');
  const rows = lines.map((text, index) => ({ text, line: index + 1 })).filter(({ text }) => text.trim() !== '' && !text.startsWith('#'));
  const [head] = rows;
  if (head === undefined) return refuse('中身がありません');
  const delimiter = delimiterOf(head.text);
  const hasHeading = !VALUES_ONLY.test(head.text);
  const data = hasHeading ? rows.slice(1) : rows;
  if (data.length > LIMITS.dataRows) return refuse(`行が多すぎます (${LIMITS.dataRows} 行まで)`);
  const width = head.text.split(delimiter).length;
  const heading: Heading = hasHeading
    ? readHeading(head.text.split(delimiter))
    : { timeScale: 1, columns: CHANNEL_NAMES.slice(0, width - 1).map((name) => ({ name, scale: 1 })), notes: [] };
  if ('reason' in heading) return refuse(heading.reason);
  if (!heading.columns.some((column) => column !== null)) return refuse('ch の列がありません (Time の後ろに Channel 1 (V) …)');
  if (data.length < 2) return refuse('点が 2 つ以上要ります');

  const time = new Float64Array(data.length);
  const values = heading.columns.map(() => new Float64Array(data.length));
  for (const [row, { text, line }] of data.entries()) {
    const cells = text.split(delimiter);
    for (let column = 0; column <= heading.columns.length; column += 1) {
      const cell = (cells[column] ?? '').trim();
      if (delimiter === ';' && DECIMAL_COMMA.test(cell)) return refuse('小数点がコンマです (WaveForms の設定で小数点をピリオドにして書き出し直します)');
      const value = cell === '' ? NaN : Number(cell);
      if (!Number.isFinite(value)) return refuse(`${line} 行目の値が読めません: ${clampText(cell, LIMITS.idLength)}`);
      if (column === 0) {
        time[row] = value * heading.timeScale;
        if (row > 0 && (time[row] ?? 0) <= (time[row - 1] ?? 0)) return refuse(`時刻が ${line} 行目で戻っています (時刻の順に並べます)`);
      } else {
        const target = values[column - 1];
        if (target !== undefined) target[row] = value * (heading.columns[column - 1]?.scale ?? 1);
      }
    }
  }
  const dt = ((time[time.length - 1] ?? 0) - (time[0] ?? 0)) / (time.length - 1);
  for (let row = 1; row < time.length; row += 1) {
    if (Math.abs((time[row] ?? 0) - (time[row - 1] ?? 0) - dt) > dt * 0.01) {
      return refuse('時刻の間隔が揃っていません (Record で書き出した分割のある記録は読めません)');
    }
  }
  const columns = heading.columns.flatMap((column, index) =>
    (column === null ? [] : [{ name: column.name, values: values[index] ?? new Float64Array() }]));
  return { ok: true, time, dt, columns, notes: heading.notes };
}
