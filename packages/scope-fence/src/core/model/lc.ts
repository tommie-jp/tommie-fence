/**
 * 2 次の低域 (`lc f0 Q`)。H(s) = ω0² / (s² + (ω0/Q)s + ω0²) — LC の低域フィルタ
 * (チョッパの出力の L と C、負荷 R なら Q = R·√(C/L))。
 *
 * **厳密な離散化** (状態 [y, y'] の遷移行列 e^(A·dt) を 1 回だけ計算する)。刻みがどれだけ
 * 粗くても発散しない (双一次変換と同じく安定、そのうえ極の位置が刻みで歪まない)。
 * 1 刻みの入力は両端の平均を保持とみなす (`rc` と同じ扱い。段の応答が dt/2 ずれない)。
 */

/** Q の範囲。0.1 未満は極が離れすぎ (実質 1 次)、100 を越える LC は実回路にない。 */
export const LC_Q = { min: 0.1, max: 100 } as const;

type Matrix = readonly [number, number, number, number];

const multiply = (a: Matrix, b: Matrix): Matrix => [
  a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3],
  a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3],
];

/** Taylor の項の数 (縮めた後の |M| < 0.5 で 2^-60 より小さい)。 */
const TAYLOR_TERMS = 16;

/** 2 × 2 の行列の指数関数 (縮めて Taylor、2 乗で戻す)。 */
export function expm2(m: Matrix): Matrix {
  const norm = Math.max(Math.abs(m[0]) + Math.abs(m[1]), Math.abs(m[2]) + Math.abs(m[3]));
  const squarings = norm > 0.5 ? Math.ceil(Math.log2(norm / 0.5)) : 0;
  const scale = 2 ** -squarings;
  const small: Matrix = [m[0] * scale, m[1] * scale, m[2] * scale, m[3] * scale];
  let term: Matrix = [1, 0, 0, 1];
  let sum: Matrix = [1, 0, 0, 1];
  for (let k = 1; k <= TAYLOR_TERMS; k += 1) {
    const next = multiply(term, small);
    term = [next[0] / k, next[1] / k, next[2] / k, next[3] / k];
    sum = [sum[0] + term[0], sum[1] + term[1], sum[2] + term[2], sum[3] + term[3]];
  }
  for (let k = 0; k < squarings; k += 1) sum = multiply(sum, sum);
  return sum;
}

export type LcStep = { readonly ad: Matrix; readonly bd: readonly [number, number] };

/**
 * 1 刻みの更新 x ← Ad·x + Bd·u。A = [[0, 1], [−ω0², −ω0/Q]]、B = [0, ω0²]、
 * Bd = A⁻¹ (Ad − I) B (A は det = ω0² > 0 で逆を持つ)。
 */
export function lcStepOf(f0: number, q: number, dt: number): LcStep {
  const w0 = 2 * Math.PI * f0;
  const w2 = w0 * w0;
  const ad = expm2([0, dt, -w2 * dt, -(w0 / q) * dt]);
  // (Ad − I) B = ω0² · [Ad01, Ad11 − 1]。A⁻¹ = (1/ω0²) [[−ω0/Q, −1], [ω0², 0]]。
  const v0 = w2 * ad[1];
  const v1 = w2 * (ad[3] - 1);
  return { ad, bd: [(-(w0 / q) * v0 - v1) / w2, v0] };
}

/**
 * 定常に入るまでの時定数 (s)。減衰の包絡 2Q/ω0 (Q ≥ 0.5)。Q < 0.5 (過減衰) は遅いほうの極
 * 1/(ω0 (1/(2Q) − √(1/(4Q²) − 1))) — 同じ値を桁落ちしない形で。Q = 0.5 で両者はつながる。
 */
export function lcSettleOf(f0: number, q: number): number {
  const w0 = 2 * Math.PI * f0;
  if (q >= 0.5) return (2 * q) / w0;
  const half = 1 / (2 * q);
  return (half + Math.sqrt(half * half - 1)) / w0;
}

/**
 * 2 次の低域を点の列に掛ける。**始めの状態は助走の平均 (y' = 0)** — 助走の頭の値から
 * 始めると、Q の高い LC は大きく鳴き (チョッパの出力が 0 V から 2.5 V へ跳ぶ)、
 * 10 τ の助走の後でもリップル (mV) より大きく残る。助走が無ければ最初の点から。
 */
export function secondOrderLowPass(input: Float64Array, dt: number, f0: number, q: number, warmup: number): Float64Array {
  const output = new Float64Array(input.length);
  const { ad, bd } = lcStepOf(f0, q, dt);
  let y = warmup > 0 ? meanUpTo(input, Math.min(warmup, input.length)) : input[0] ?? 0;
  let v = 0;
  for (let index = 0; index < input.length; index += 1) {
    if (index > 0) {
      const u = ((input[index - 1] ?? 0) + (input[index] ?? 0)) / 2;
      const nextY = ad[0] * y + ad[1] * v + bd[0] * u;
      v = ad[2] * y + ad[3] * v + bd[1] * u;
      y = nextY;
    }
    output[index] = y;
  }
  return output;
}

/** [0, to) の平均。 */
function meanUpTo(values: Float64Array, to: number): number {
  let sum = 0;
  for (let index = 0; index < to; index += 1) sum += values[index] ?? 0;
  return to > 0 ? sum / to : 0;
}
