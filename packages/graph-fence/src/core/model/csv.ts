import { normalizeNewlines } from 'fence-kit';
import { dropInvisible } from '../errors.ts';
import { LIMITS, clampText } from '../limits.ts';
import type { Point } from './lines.ts';
import { PREFIXES } from './quantity.ts';

/**
 * `data:` の CSV を読む。**1 列目が x、以降が y の列**。読者が手で打った 2 列の表と、
 * WaveForms の Network の Export (`Frequency (Hz)`、`Channel 2 Magnitude (dB)` …) の両方を受ける。
 *
 * - `#` で始まる行は頭書き (読み捨てる。字は図に出さない)
 * - 区切りは `,` か タブ か `;`。最初の字を含む行が見出し。括弧の中が単位 (`周波数 (kHz)`)
 * - **x の単位は軸と照らす** — 同じならそのまま、接頭辞だけ違えば直す (`kHz` → ×1000)、
 *   違う単位は断る (黙って別の値に読まない)
 * - x は増える順に並べる。**空の欄はその点を抜く** (手で打った表の測り損ね)
 * - 小数点はピリオドだけ。**列の数は配列を確保する前に断る** (scope の CRITICAL と同じ守り)
 */
export type CsvColumn = { readonly name: string; readonly unit: string | null; readonly points: readonly Point[] };

export type CsvRead =
  | { readonly ok: true; readonly columns: readonly CsvColumn[]; readonly notes: readonly string[] }
  | { readonly ok: false; readonly reason: string };

const refuse = (reason: string): CsvRead => ({ ok: false, reason });

const HEADING = /^(.*?)\s*\(([^()]*)\)\s*$/;
const DECIMAL_COMMA = /^[+-]?\d+,\d+$/;
/** 見出しと値の並びを見分ける (数字を含み、数と区切りと指数の e しか無ければ値の行)。 */
const VALUES_ONLY = /^(?=.*\d)[\s\d.,;+\-eE]*$/;

const delimiterOf = (line: string): string => (line.includes('\t') ? '\t' : line.includes(';') ? ';' : ',');

const shown = (text: string): string => clampText(dropInvisible(text.trim()), LIMITS.idLength);

/** 見出しの 1 欄 → 名前と単位。 */
function headingOf(cell: string, index: number): { readonly name: string; readonly unit: string | null } {
  const found = HEADING.exec(cell.trim());
  const name = shown(found?.[1] ?? cell);
  const unit = found?.[2]?.trim();
  return { name: name === '' ? `列 ${index + 1}` : name, unit: unit === undefined || unit === '' ? null : shown(unit) };
}

/** x の列の単位を軸の単位に直す倍率。直せなければ理由。 */
function xScale(unit: string | null, axisUnit: string): number | string {
  if (unit === null || unit === axisUnit) return 1;
  if (unit.length === axisUnit.length + 1 && unit.endsWith(axisUnit) && Object.hasOwn(PREFIXES, unit[0] ?? '')) {
    return PREFIXES[unit[0] ?? ''] ?? 1;
  }
  return `1 列目の単位 (${unit}) が横軸 (${axisUnit}) と違います`;
}

export function parseCsv(input: string, axisUnit: string): CsvRead {
  const lines = normalizeNewlines(input).split('\n');
  const rows = lines.map((text, index) => ({ text, line: index + 1 })).filter(({ text }) => text.trim() !== '' && !text.startsWith('#'));
  const [head] = rows;
  if (head === undefined) return refuse('中身がありません');
  const delimiter = delimiterOf(head.text);
  const width = head.text.split(delimiter).length;
  if (width > LIMITS.dataColumns) return refuse(`列が多すぎます (${LIMITS.dataColumns} 列まで)`);
  if (width < 2) return refuse('x と y の 2 列以上にします (区切りは , かタブ)');
  const hasHeading = !VALUES_ONLY.test(head.text);
  const data = hasHeading ? rows.slice(1) : rows;
  if (data.length > LIMITS.dataRows) return refuse(`行が多すぎます (${LIMITS.dataRows} 行まで)`);
  if (data.length === 0) return refuse('値の行がありません');

  const cells = hasHeading ? head.text.split(delimiter) : Array.from({ length: width }, (_, index) => (index === 0 ? 'x' : `y${index}`));
  const headings = cells.map(headingOf);
  const scale = xScale(headings[0]?.unit ?? null, axisUnit);
  if (typeof scale === 'string') return refuse(scale);

  const columns: Point[][] = headings.slice(1).map(() => []);
  let previous = -Infinity;
  for (const { text, line } of data) {
    const values = text.split(delimiter);
    if (values.length > width) return refuse(`${line} 行目の欄が見出しより多いです`);
    const read = (cell: string): number | null | string => {
      const trimmed = cell.trim();
      if (trimmed === '') return null;
      if (delimiter === ';' && DECIMAL_COMMA.test(trimmed)) return '小数点がコンマです (ピリオドにして書き出し直します)';
      const value = Number(trimmed);
      return Number.isFinite(value) ? value : `${line} 行目の値が読めません: ${shown(trimmed)}`;
    };
    const x = read(values[0] ?? '');
    if (typeof x === 'string') return refuse(x);
    if (x === null) return refuse(`${line} 行目の x が空です`);
    const scaled = x * scale;
    if (scaled <= previous) return refuse(`x が ${line} 行目で増えていません (x の小さい順に並べます)`);
    previous = scaled;
    for (let column = 1; column < width; column += 1) {
      const y = read(values[column] ?? '');
      if (typeof y === 'string') return refuse(y);
      if (y !== null) columns[column - 1]?.push({ x: scaled, y });
    }
  }
  const notes: string[] = [];
  const kept = headings.slice(1).flatMap((heading, index) => {
    const points = columns[index] ?? [];
    if (points.length === 0) {
      notes.push(`${heading.name} の列は値が無いので読み捨てました`);
      return [];
    }
    return [{ name: heading.name, unit: heading.unit, points }];
  });
  if (kept.length === 0) return refuse('y の列に値がありません');
  return { ok: true, columns: kept, notes };
}
