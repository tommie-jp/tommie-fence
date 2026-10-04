import { formatHertzShort } from 'fence-kit';
import { notice } from '../errors.ts';
import type { FenceDocument, FenceError } from '../types.ts';
import { looksLikeMegahertz, parseSpectrumCsv } from './csv.ts';
import type { LevelUnit } from './device.ts';
import { fromUnit, toUnit } from './level.ts';
import type { Point } from './trace.ts';

/** `data:` のファイルを読む口 (宿主が渡す。core はファイルを開かない)。見つからなければ null。 */
export type DataSource = (name: string) => string | null;

export type Measured = {
  /** 掃引の中の点 (表示の単位)。 */
  readonly points: readonly Point[];
  readonly name: string | null;
  readonly said: readonly FenceError[];
};

const NOTHING: Measured = { points: [], name: null, said: [] };

/**
 * `data:` を読む。**読めなくても図は出す** (言うことはお知らせ)。描くのは掃引の中の点だけ。
 * 見出しの無い CSV は Hz と dBm (tinySA の SAVE TRACES)、`unit:` を書けばその単位。
 */
export function readData(
  doc: FenceDocument,
  screen: { readonly start: number; readonly stop: number; readonly unit: LevelUnit },
  source: DataSource | undefined,
): Measured {
  if (doc.data === null) return NOTHING;
  const { value: name, label, line } = doc.data;
  const say = (message: string): Measured => ({ ...NOTHING, said: [notice(message, line, name)] });
  if (source === undefined) return say(`この宿主では ${name} を読めません (CLI か VS Code の拡張で描くと実測が重なります)`);
  let text: string | null;
  try {
    text = source(name);
  } catch {
    text = null;
  }
  if (text === null) return say(`${name} が見つかりません (.md と同じ場所に置きます)`);
  const read = parseSpectrumCsv(text);
  if (!read.ok) return say(`${name} を読めません: ${read.reason}`);
  const said: FenceError[] = [];
  const megahertz = !read.headed && looksLikeMegahertz(read.frequencies, screen.stop);
  if (megahertz) said.push(notice(`${name}: 周波数が MHz で書かれているとみて読みました (見出しの無い CSV は Hz のはず)`, line, name));
  const scale = megahertz ? 1e6 : 1;
  const written = read.unit ?? doc.unit?.value ?? 'dBm';
  const points: Point[] = [];
  read.frequencies.forEach((raw, index) => {
    const f = raw * scale;
    if (f < screen.start || f > screen.stop) return;
    const level = toUnit(fromUnit(read.levels[index] ?? 0, written), screen.unit);
    points.push({ f, level, at: f });
  });
  if (points.length === 0) {
    said.push(notice(`${name} には掃引 (${formatHertzShort(screen.start)}〜${formatHertzShort(screen.stop)}) の中の点がありません`, line, name));
  }
  // 凡例と読み値の見出しに出す名前 (`実測 (a.csv)` `計算 (a.csv)`)。
  return { points, name: `${label} (${name})`, said };
}
