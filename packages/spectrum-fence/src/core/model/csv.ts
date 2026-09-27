import { normalizeNewlines } from 'fence-kit';
import { dropInvisible } from '../errors.ts';
import { LIMITS, clampText } from '../limits.ts';
import type { LevelUnit } from './device.ts';

/**
 * 測ったスペクトルの CSV / TXT を読む — **2 列 (周波数・レベル)**。書き手は 2 つ:
 * tinySA の SAVE TRACES (見出し無し、Hz と dBm) と WaveForms の Spectrum の Export
 * (`#` の頭書き + `Frequency (Hz),Trace 1 (dBV)`)。形は実物を写すまでの仮 (52 の docs/88 §5)。
 *
 * - `#` の頭書きは読み捨てる (字は図に出さない。エスケープの前に出さないのが一番安い)
 * - 区切りは `,` / `;` / タブ。**列は 2 つ** (行末の区切りの後の空は許す)。多ければ配列を
 *   確保する前に断る (scope の CSV で列に上限が無く、確保が膨らんだ — d45e7f4)
 * - 見出しがあれば単位を読む (`(Hz)` `(kHz)` `(MHz)` `(GHz)`、`(dBm)` `(dBV)`)
 * - **周波数は単調に増える**こと。小数点はピリオドだけ (ロケールのコンマは断る)
 * - ファイルから読んだ字を言うときは `dropInvisible` を通す (端末と帯を偽装させない)
 */
export type SpectrumCsv =
  | {
    readonly ok: true;
    readonly frequencies: Float64Array;
    readonly levels: Float64Array;
    /** 見出しから読めたレベルの単位。見出しが無ければ null (呼ぶ側が決める)。 */
    readonly unit: LevelUnit | null;
    /** 見出しがあったか (無ければ周波数の単位を桁で見分ける余地がある)。 */
    readonly headed: boolean;
  }
  | { readonly ok: false; readonly reason: string };

const refuse = (reason: string): SpectrumCsv => ({ ok: false, reason });

const FREQUENCY_UNITS: Readonly<Record<string, number>> = { hz: 1, khz: 1e3, mhz: 1e6, ghz: 1e9 };
const FREQUENCY_HEAD = /^Freq(?:uency)?\s*\((Hz|kHz|MHz|GHz)\)$/i;
const LEVEL_HEAD = /\((dBm|dBV)\)$/i;
const DECIMAL_COMMA = /^[+-]?\d+,\d+$/;
/** 見出しと値の並びを見分ける (数と区切りと指数の e しか無ければ値の行)。 */
const VALUES_ONLY = /^[\s\d.,;+\-eE]*$/;

/** 読み手に見せる字 (見えない字を除いて切る)。 */
const shown = (text: string): string => clampText(dropInvisible(text.trim()), LIMITS.idLength);

const delimiterOf = (line: string): string => (line.includes('\t') ? '\t' : line.includes(';') ? ';' : ',');

/** 行を区切る。行末の区切りの後の空は落とす。 */
const cellsOf = (line: string, delimiter: string): readonly string[] => {
  const cells = line.split(delimiter);
  return cells.length > 2 && (cells.at(-1) ?? '').trim() === '' ? cells.slice(0, -1) : cells;
};

type Heading = { readonly scale: number; readonly unit: LevelUnit } | { readonly reason: string };

function readHeading(cells: readonly string[]): Heading {
  const [first = '', second = ''] = cells.map((cell) => cell.trim());
  const frequency = FREQUENCY_HEAD.exec(first);
  if (frequency === null) return { reason: `1 列目は Frequency (Hz) にします (いまは ${shown(first)})` };
  const level = LEVEL_HEAD.exec(second);
  if (level === null) return { reason: `2 列目の見出しに単位 (dBm) か (dBV) を書きます (いまは ${shown(second)})` };
  const unit: LevelUnit = level[1]?.toLowerCase() === 'dbm' ? 'dBm' : 'dBV';
  return { scale: FREQUENCY_UNITS[(frequency[1] ?? 'hz').toLowerCase()] ?? 1, unit };
}

export function parseSpectrumCsv(input: string): SpectrumCsv {
  const rows = normalizeNewlines(input).split('\n')
    .map((text, index) => ({ text, line: index + 1 }))
    .filter(({ text }) => text.trim() !== '' && !text.startsWith('#'));
  const [head] = rows;
  if (head === undefined) return refuse('中身がありません');
  const delimiter = delimiterOf(head.text);
  if (cellsOf(head.text, delimiter).length !== 2) return refuse('列は 2 つ (周波数とレベル) にします');
  const headed = !VALUES_ONLY.test(head.text);
  const data = headed ? rows.slice(1) : rows;
  if (data.length > LIMITS.dataRows) return refuse(`行が多すぎます (${LIMITS.dataRows} 行まで)`);
  if (data.length < 2) return refuse('点が 2 つ以上要ります');
  const heading: Heading = headed ? readHeading(cellsOf(head.text, delimiter)) : { scale: 1, unit: 'dBm' };
  if ('reason' in heading) return refuse(heading.reason);

  const frequencies = new Float64Array(data.length);
  const levels = new Float64Array(data.length);
  for (const [row, { text, line }] of data.entries()) {
    const cells = cellsOf(text, delimiter);
    if (cells.length !== 2) return refuse(`${line} 行目の列が 2 つではありません`);
    const values = cells.map((cell) => cell.trim());
    if (delimiter === ';' && values.some((cell) => DECIMAL_COMMA.test(cell))) {
      return refuse('小数点がコンマです (小数点をピリオドにして書き出し直します)');
    }
    const [f, level] = values.map((cell) => (cell === '' ? NaN : Number(cell)));
    if (!Number.isFinite(f) || !Number.isFinite(level)) {
      const bad = Number.isFinite(f) ? values[1] ?? '' : values[0] ?? '';
      return refuse(`${line} 行目の値が読めません: ${shown(bad)}`);
    }
    frequencies[row] = (f ?? 0) * heading.scale;
    levels[row] = level ?? 0;
    if (row > 0 && (frequencies[row] ?? 0) <= (frequencies[row - 1] ?? 0)) return refuse(`周波数が ${line} 行目で戻っています (周波数の順に並べます)`);
  }
  return { ok: true, frequencies, levels, unit: headed ? heading.unit : null, headed };
}

/**
 * 見出しの無い CSV の周波数が **MHz で書かれている** (tinySA の「MHz CSV」) か。
 * 桁で見分ける: Hz と読むより MHz と読むほうが掃引の終わりに近ければ MHz。
 */
export function looksLikeMegahertz(frequencies: Float64Array, stop: number): boolean {
  const top = frequencies[frequencies.length - 1] ?? 0;
  if (!(top > 0) || !(stop > 0)) return false;
  return Math.abs(Math.log10((top * 1e6) / stop)) < Math.abs(Math.log10(top / stop));
}
