import { normalizeNewlines } from 'fence-kit';
import { LIMITS } from '../limits.ts';
import { complex, polar } from './complex.ts';
import type { Complex } from './complex.ts';
import type { SPoint } from './sparams.ts';

/**
 * Touchstone 1.x (`.s1p` / `.s2p`) を読む。NanoVNA-Saver・実機 (SD 保存)・
 * QucsStudio・scikit-rf が書く形。**2.0 (`[Version] 2.0`) は読まない**。
 *
 * - 頭の `# HZ S RI R 50` (順不同・大小文字どちらも)。無ければ既定の `# GHZ S MA R 50`
 * - `!` から後ろは注釈。空行は飛ばす
 * - `.s2p` の 1 行は周波数 + 8 値。**並びは S11 S21 S12 S22** (S21 が S12 より先)
 */
export type Touchstone = {
  readonly ports: 1 | 2;
  readonly z0: number;
  readonly points: readonly SPoint[];
};

export type TouchstoneRead = { readonly ok: true; readonly value: Touchstone } | { readonly ok: false; readonly reason: string };

const UNITS: Readonly<Record<string, number>> = { HZ: 1, KHZ: 1e3, MHZ: 1e6, GHZ: 1e9 };
type Format = 'RI' | 'MA' | 'DB';
const FORMATS: readonly Format[] = ['RI', 'MA', 'DB'];

type Options = { readonly unit: number; readonly format: Format; readonly z0: number };

const fail = (reason: string): TouchstoneRead => ({ ok: false, reason });

/** 頭の行を読む。読めなければ理由。 */
function readOptions(line: string, at: number): Options | string {
  const words = line.slice(1).trim().toUpperCase().split(/\s+/).filter((word) => word !== '');
  let unit = 1e9;
  let format: Format = 'MA';
  let z0 = 50;
  for (let index = 0; index < words.length; index += 1) {
    const word = words[index] ?? '';
    if (Object.hasOwn(UNITS, word)) unit = UNITS[word] ?? unit;
    else if ((FORMATS as readonly string[]).includes(word)) format = word as Format;
    else if (word === 'S') continue;
    else if (word === 'R') {
      const value = Number(words[index + 1]);
      if (!Number.isFinite(value) || value <= 0) return `${at} 行目: R の後ろに基準のインピーダンスを書きます`;
      z0 = value;
      index += 1;
    } else if (['Y', 'Z', 'H', 'G'].includes(word)) {
      return `${at} 行目: ${word} パラメータは読めません (S パラメータのファイルにします)`;
    } else {
      return `${at} 行目: 頭の行の ${word} が読めません (# HZ S RI R 50 の形)`;
    }
  }
  return { unit, format, z0 };
}

function valueFrom(first: number, second: number, format: Format): Complex {
  if (format === 'RI') return complex(first, second);
  const angle = (second * Math.PI) / 180;
  const magnitude = format === 'MA' ? first : 10 ** (first / 20);
  return polar(magnitude, angle);
}

/** 字 → Touchstone。`ports` はファイル名の拡張子から (`.s1p` は 1)。 */
export function parseTouchstone(text: string, ports: 1 | 2): TouchstoneRead {
  if (text.length > LIMITS.dataBytes) return fail(`大きすぎます (${Math.round(LIMITS.dataBytes / 1e6)} MB まで)`);
  const lines = normalizeNewlines(text).split('\n');
  const width = ports === 1 ? 3 : 9;
  let options: Options | null = null;
  const numbers: { readonly values: readonly number[]; readonly at: number }[] = [];
  let pending: number[] = [];
  let pendingAt = 0;

  for (const [index, raw] of lines.entries()) {
    const at = index + 1;
    const line = (raw.split('!')[0] ?? '').trim();
    if (line === '') continue;
    if (line.startsWith('[')) return fail(`${at} 行目: Touchstone 2.0 はまだ読めません (1.x の形で書き出します)`);
    if (line.startsWith('#')) {
      if (options !== null) continue; // 2 つ目以降の頭は仕様どおり無視する
      const read = readOptions(line, at);
      if (typeof read === 'string') return fail(read);
      options = read;
      continue;
    }
    const values = line.split(/\s+/).map(Number);
    if (values.some((value) => !Number.isFinite(value))) return fail(`${at} 行目: 数でない値があります`);
    // **2 ポートの雑音パラメータはここで打ち切る。** 決まりでは、周波数が前の点
    // 以下に戻った所から雑音の表 (1 行 5 値) になる (メーカーのトランジスタのファイル)。
    const previous = numbers.at(-1)?.values[0];
    if (ports === 2 && pending.length === 0 && previous !== undefined && (values[0] ?? 0) <= previous) break;
    // **2 ポートは 1 点が行をまたぐことがある** (古い書き手)。足りるまで継ぐ。
    if (pending.length === 0) pendingAt = at;
    pending = [...pending, ...values];
    if (pending.length < width) continue;
    if (pending.length > width) return fail(`${pendingAt} 行目: 1 点の値の数が ${width} ではありません (${pending.length})`);
    numbers.push({ values: pending, at: pendingAt });
    pending = [];
    if (numbers.length > LIMITS.dataPoints) return fail(`点が多すぎます (${LIMITS.dataPoints} 点まで)`);
  }
  if (pending.length > 0) return fail(`${pendingAt} 行目: 値が足りません (1 点に ${width} 個)`);
  if (numbers.length === 0) return fail('点が 1 つもありません');

  const { unit, format, z0 } = options ?? { unit: 1e9, format: 'MA' as Format, z0: 50 };
  const points: SPoint[] = [];
  for (const { values, at } of numbers) {
    const f = (values[0] ?? 0) * unit;
    const last = points.at(-1);
    if (last !== undefined && f <= last.f) return fail(`${at} 行目: 周波数が増えていません`);
    const pair = (index: number): Complex => valueFrom(values[index] ?? 0, values[index + 1] ?? 0, format);
    points.push(ports === 1
      ? { f, s11: pair(1), s21: null, s12: null, s22: null }
      : { f, s11: pair(1), s21: pair(3), s12: pair(5), s22: pair(7) });
  }
  return { ok: true, value: { ports, z0, points } };
}

/** ファイル名から端子の数。**`.s1p` / `.s2p` 以外は null**。 */
export function portsOf(name: string): 1 | 2 | null {
  const found = /\.s([12])p$/i.exec(name);
  return found === null ? null : found[1] === '1' ? 1 : 2;
}
