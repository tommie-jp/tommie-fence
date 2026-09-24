/**
 * 線路の特性インピーダンス (Z0) と実効比誘電率 (εeff)。**図のキャプションに出す
 * 目安**で、銅厚と周波数分散は見ない (35µm の銅厚は 3mm 幅で 1% ほど)。
 *
 * - マイクロストリップ (裏ベタ) — Hammerstad-Jensen (1980)。52 の docs/73 §1.5 で
 *   Python に組んで、web の計算機 (FR4 1.6mm で約 3.0mm) と合うのを確かめた式
 * - CPW (表が地・裏なし) と CPWG (表も裏も地) — 等角写像の式。完全楕円積分は
 *   算術幾何平均で求める (近似式を使わない)。CPWG 幅 1.0・隙間 0.15・1.6mm で
 *   50.7Ω (ZEP の記事の 50Ω と合う)
 */

const ETA0 = 376.730313;
const C0 = 299_792_458;

/** 算術幾何平均。60 回で倍精度の限界に届く。 */
function agm(a: number, b: number): number {
  let [x, y] = [a, b];
  for (let i = 0; i < 60 && Math.abs(x - y) > 1e-15 * x; i += 1) [x, y] = [(x + y) / 2, Math.sqrt(x * y)];
  return x;
}

/** 第 1 種完全楕円積分 K(k)。 */
const ellipticK = (k: number): number => Math.PI / (2 * agm(1, Math.sqrt(1 - k * k)));

/** K(k) / K(k')。 */
const kRatio = (k: number): number => ellipticK(k) / ellipticK(Math.sqrt(1 - k * k));

export type LineModel = { readonly z0: number; readonly epsEff: number };

/** マイクロストリップ (幅 w・基材の厚さ h、どちらも mm)。 */
export function microstrip(w: number, h: number, er: number): LineModel {
  const u = w / h;
  const a = 1
    + Math.log((u ** 4 + (u / 52) ** 2) / (u ** 4 + 0.432)) / 49
    + Math.log(1 + (u / 18.1) ** 3) / 18.7;
  const b = 0.564 * ((er - 0.9) / (er + 3)) ** 0.053;
  const epsEff = (er + 1) / 2 + ((er - 1) / 2) * (1 + 10 / u) ** (-a * b);
  const f = 6 + (2 * Math.PI - 6) * Math.exp(-((30.666 / u) ** 0.7528));
  const z01 = (ETA0 / (2 * Math.PI)) * Math.log(f / u + Math.sqrt(1 + (2 / u) ** 2));
  return { z0: z01 / Math.sqrt(epsEff), epsEff };
}

/** CPW (表の地との隙間 s、裏に地なし)。 */
export function coplanar(w: number, s: number, h: number, er: number): LineModel {
  const k0 = w / (w + 2 * s);
  const k1 = Math.sinh((Math.PI * w) / (4 * h)) / Math.sinh((Math.PI * (w + 2 * s)) / (4 * h));
  const epsEff = 1 + ((er - 1) / 2) * (kRatio(k1) / kRatio(k0));
  return { z0: (30 * Math.PI) / Math.sqrt(epsEff) / kRatio(k0), epsEff };
}

/** CPWG (表の地との隙間 s、裏にも地)。 */
export function groundedCoplanar(w: number, s: number, h: number, er: number): LineModel {
  const k0 = w / (w + 2 * s);
  const k3 = Math.tanh((Math.PI * w) / (4 * h)) / Math.tanh((Math.PI * (w + 2 * s)) / (4 * h));
  const q = kRatio(k3) / kRatio(k0);
  const epsEff = (1 + er * q) / (1 + q);
  return { z0: (60 * Math.PI) / Math.sqrt(epsEff) / (kRatio(k0) + kRatio(k3)), epsEff };
}

/** 線路の中の波長 (mm)。 */
export const guidedWavelength = (hz: number, epsEff: number): number => (C0 / hz / Math.sqrt(epsEff)) * 1000;

/** 長さ (mm) の電気長 (度)。 */
export const electricalDegrees = (length: number, hz: number, epsEff: number): number =>
  (length / guidedWavelength(hz, epsEff)) * 360;

/**
 * 目当ての Z0 になるマイクロストリップの幅 (mm)。二分法 (Z0 は幅について単調に減る)。
 * 図の下の 1 行に「50Ω = 3.06mm」と出すのに使う。
 */
export function microstripWidthFor(z0: number, h: number, er: number): number {
  let [lo, hi] = [0.001, 100];
  for (let i = 0; i < 80; i += 1) {
    const mid = (lo + hi) / 2;
    if (microstrip(mid, h, er).z0 > z0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * 周波数 `2.4G` `2400M` `1.575GHz` `433MHz`。Hz で返す。
 * **接頭辞は k・M・G だけ** (m を M と取り違えると 10^9 倍違う)。
 */
const FREQUENCY = /^(\d+(?:\.\d+)?)\s*([kMG])?(?:Hz)?$/;
const SCALE: Readonly<Record<string, number>> = { k: 1e3, M: 1e6, G: 1e9 };

export const F_MIN = 1e6;
export const F_MAX = 1e11;

export function parseHertz(text: string): number | null {
  const found = FREQUENCY.exec(text.trim());
  if (found === null) return null;
  const value = Number(found[1]) * (found[2] === undefined ? 1 : SCALE[found[2]] ?? 1);
  return value > 0 ? value : null;
}

/** 周波数の綴り (`2.4GHz` `433MHz`)。 */
export function formatHertz(hz: number): string {
  const [scale, unit] = hz >= 1e9 ? [1e9, 'GHz'] : hz >= 1e6 ? [1e6, 'MHz'] : [1e3, 'kHz'];
  return `${Math.round((hz / scale) * 1000) / 1000}${unit}`;
}
