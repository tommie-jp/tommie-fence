import type { CsvColumn } from './csv.ts';
import type { LineSpec } from './lines.ts';

/**
 * 実測の列を線に当てる。**当て方は 3 段** (52 の docs/96 §4.1):
 *
 * 1. 単位が同じで、名前が線の名前と同じ (前後の空白と大文字小文字を無視) → その線の実測
 * 2. 1 で当たらず、単位が同じ理想の線が 1 本だけ → その線の実測
 * 3. どれにも当たらなければ**新しい線** (名前は見出し。単位も無ければ最初の線の単位) — 言う
 *
 * **1 本の線に当てる列は 1 つだけ** (2 列目からは新しい線)。含む・含まれるで当てると、
 * 1 字の線名 (`A`) が見出しのどこにでも当たってしまう。
 *
 * 当たった実測は理想の線と同じ色 (同じ番号) で打つ。WaveForms の見出し
 * (`Channel 2 Magnitude (dB)`) は線の名前と一致しないので、2 で当たるのが普通。
 */
export type Matched = { readonly lines: readonly LineSpec[]; readonly said: readonly string[] };

const same = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

export function matchColumns(columns: readonly CsvColumn[], ideal: readonly LineSpec[], fallbackUnit: string): Matched {
  const said: string[] = [];
  let next = ideal.length;
  const used = new Set<LineSpec>();
  const lines = columns.map((column): LineSpec => {
    const unit = column.unit ?? ideal[0]?.unit ?? fallbackUnit;
    const sameUnit = ideal.filter((line) => line.unit === unit && !used.has(line));
    const target = sameUnit.find((line) => same(line.name, column.name))
      ?? (ideal.filter((line) => line.unit === unit).length === 1 ? sameUnit[0] : undefined);
    if (target !== undefined) used.add(target);
    const source = { kind: 'data', points: column.points, column: column.name } as const;
    if (target !== undefined) return { name: target.name, unit, source, index: target.index, line: null };
    if (ideal.length > 0) said.push(`${column.name} の列は当たる線が無いので、新しい線として打ちました (線の名前か単位を列の見出しに合わせると重なります)`);
    const index = next;
    next += 1;
    return { name: column.name, unit, source, index, line: null };
  });
  return { lines, said };
}
