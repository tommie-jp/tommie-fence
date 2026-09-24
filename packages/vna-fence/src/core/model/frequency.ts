/**
 * 周波数の読み書き。**綴りは NanoVNA の画面と同じ**にする (`10.000 MHz`)。
 *
 * copper-fence にも同じ読み (`parseHertz`) がある。fence-kit へ上げるのは
 * 2 つを見比べて綴りの受け方を揃えるときにする (52 の docs/76)。
 */

const SCALE: Readonly<Record<string, number>> = { '': 1, k: 1e3, K: 1e3, m: 1e6, M: 1e6, g: 1e9, G: 1e9 };

/** `50k` `1M` `2.4G` `1575MHz` `10000000` `433 MHz`。`m` は M と同じ (周波数にミリは無い)。 */
const FREQUENCY = /^(\d+(?:\.\d+)?|\.\d+)\s*([kKmMgG]?)(?:hz|Hz|HZ)?$/;

/** 周波数を Hz に。読めなければ null。0 以下も null。 */
export function parseHertz(text: string): number | null {
  const found = FREQUENCY.exec(text.trim());
  if (found === null) return null;
  const value = Number(found[1]) * (SCALE[found[2] ?? ''] ?? 1);
  return Number.isFinite(value) && value > 0 ? value : null;
}

const unitOf = (hz: number): readonly [number, string] => {
  const size = Math.abs(hz);
  if (size >= 1e9) return [1e9, 'GHz'];
  if (size >= 1e6) return [1e6, 'MHz'];
  if (size >= 1e3) return [1e3, 'kHz'];
  return [1, 'Hz'];
};

/** 読み値の綴り。**NanoVNA のマーカーと同じ小数 3 桁** (`10.000 MHz`)。 */
export function formatHertz(hz: number): string {
  const [scale, unit] = unitOf(hz);
  return `${(hz / scale).toFixed(3)} ${unit}`;
}

/** 目盛の綴り。**末尾の 0 を落とす** (`150 MHz` `1.5 GHz` `50 kHz`)。 */
export function formatHertzShort(hz: number): string {
  const [scale, unit] = unitOf(hz);
  const value = Math.round((hz / scale) * 1000) / 1000;
  return `${value} ${unit}`;
}
