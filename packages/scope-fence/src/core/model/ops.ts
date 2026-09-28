/**
 * 波に通す操作 (`ch2: ch1 | rc 1ms | clip -0.7V 0.7V`)。**点の列に掛ける** — 閉じた式に
 * しないので、波と操作を 1 つの道で扱え、理想と実測を同じ算法で測れる (52 の docs/85)。
 * 「見るべき値」の式は発生器の波を回路が加工した物で、加工は 1 次の RC・頭打ち・
 * ずらし・倍率・絶対値でほぼ尽きる (52 の docs/81 決め 5)。
 */
export type Op =
  /** 1 次の低域 (RC)。τ (s)。 */
  | { readonly kind: 'rc'; readonly tau: number }
  /**
   * ピークホールド (τ で落ちる): `y = max(x, y·e^(−dt/τ))`。**理想のダイオードの後ろの
   * コンデンサ入力** — 入力が上ならコンデンサは入力に付いて行き、下なら負荷 (τ = RL·C) で放電する。
   */
  | { readonly kind: 'peak'; readonly tau: number }
  /** 頭打ち。null の側は切らない (`clip 0V` は下だけ)。 */
  | { readonly kind: 'clip'; readonly low: number | null; readonly high: number | null }
  | { readonly kind: 'offset'; readonly volts: number }
  | { readonly kind: 'gain'; readonly factor: number }
  | { readonly kind: 'abs' };

export const OP_NAMES = ['rc', 'peak', 'clip', 'offset', 'gain', 'abs'] as const;
export type OpName = (typeof OP_NAMES)[number];

function applyOne(input: Float64Array, dt: number, op: Op): Float64Array {
  const output = new Float64Array(input.length);
  switch (op.kind) {
    case 'rc': {
      // **指数の更新** (`1 − e^(−dt/τ)`)。dt が τ より粗くても発散しない。1 刻みの入力は
      // 両端の平均とみなす — 片方の端だけ使うと、段の応答が dt/2 だけ早まるか遅れる
      // (5-1 の 1 τ の値が 3 桁目でずれる)。
      const k = 1 - Math.exp(-dt / op.tau);
      let y = input[0] ?? 0;
      for (let index = 0; index < input.length; index += 1) {
        if (index > 0) y += (((input[index - 1] ?? 0) + (input[index] ?? 0)) / 2 - y) * k;
        output[index] = y;
      }
      return output;
    }
    case 'peak': {
      const decay = Math.exp(-dt / op.tau);
      let y = input[0] ?? 0;
      for (let index = 0; index < input.length; index += 1) {
        if (index > 0) y = Math.max(input[index] ?? 0, y * decay);
        output[index] = y;
      }
      return output;
    }
    case 'clip': {
      const low = op.low ?? -Infinity;
      const high = op.high ?? Infinity;
      for (let index = 0; index < input.length; index += 1) output[index] = Math.min(high, Math.max(low, input[index] ?? 0));
      return output;
    }
    case 'offset':
      for (let index = 0; index < input.length; index += 1) output[index] = (input[index] ?? 0) + op.volts;
      return output;
    case 'gain':
      // 桁あふれで factor か入力が Infinity / NaN になっても、線は 0 に落として通す
      // (呼ぶ側まで NaN / Infinity を運ばない。断るのは読みの側の役目)。
      for (let index = 0; index < input.length; index += 1) {
        const value = (input[index] ?? 0) * op.factor;
        output[index] = Number.isFinite(value) ? value : 0;
      }
      return output;
    case 'abs':
      for (let index = 0; index < input.length; index += 1) output[index] = Math.abs(input[index] ?? 0);
      return output;
  }
}

/** 操作を書いた順に掛ける。**新しい配列を返す** (入力は書き換えない)。 */
export function applyOps(samples: Float64Array, dt: number, ops: readonly Op[]): Float64Array {
  return ops.reduce<Float64Array>((current, op) => applyOne(current, dt, op), Float64Array.from(samples));
}

/** 操作の τ の和 (助走の長さを決める)。**rc と peak は同じ助走** (どちらも τ で定常に入る)。 */
export const tauOf = (ops: readonly Op[]): number =>
  ops.reduce((sum, op) => sum + (op.kind === 'rc' || op.kind === 'peak' ? op.tau : 0), 0);
