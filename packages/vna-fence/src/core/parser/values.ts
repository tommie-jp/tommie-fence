import { parseOhms } from 'fence-kit';

/**
 * 値の読み。**R は fence-kit の読み** (`100` `4k7` `1M` `50Ω`) — 板のフェンスと
 * 同じ綴りが通る。L と C は SI の接頭辞 (`47p` `100n` `0.1u` `1µ`)。
 * **接頭辞の無い数は F / H のまま**読む (`47` は 47 F)。範囲で書き間違いを弾く。
 */

const SI: Readonly<Record<string, number>> = {
  '': 1, f: 1e-15, p: 1e-12, n: 1e-9, u: 1e-6, µ: 1e-6, μ: 1e-6, m: 1e-3,
};

const PREFIXED = /^(\d+(?:\.\d+)?|\.\d+)\s*([fpnuµμm]?)([FH])?$/;

/** L か C の値 (H / F)。読めなければ null。 */
export function parseReactive(text: string, unit: 'F' | 'H'): number | null {
  const found = PREFIXED.exec(text.trim());
  if (found === null) return null;
  if (found[3] !== undefined && found[3] !== unit) return null;
  const value = Number(found[1]) * (SI[found[2] ?? ''] ?? 1);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** 抵抗 (Ω)。**0 Ω も通す** (理想の短絡の直列・ESR 0)。 */
export function parseResistance(text: string): number | null {
  if (/^0+(?:\.0+)?\s*(?:Ω|ohms?)?$/iu.test(text.trim())) return 0;
  return parseOhms(text);
}

/** 長さ (m)。**単位は必須** (`1m` `25cm` `300mm`)。 */
export function parseLength(text: string): number | null {
  const found = /^(\d+(?:\.\d+)?|\.\d+)\s*(mm|cm|m)$/.exec(text.trim());
  if (found === null) return null;
  const value = Number(found[1]) * (found[2] === 'mm' ? 1e-3 : found[2] === 'cm' ? 1e-2 : 1);
  return value > 0 ? value : null;
}

/** 素の数 (Z0 や速度係数)。 */
export function parseNumber(text: string): number | null {
  if (!/^(\d+(?:\.\d+)?|\.\d+)$/.test(text.trim())) return null;
  return Number(text);
}
