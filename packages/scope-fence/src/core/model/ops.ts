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
   * 1 次の高域 (CR の微分回路)。τ (s)。**`x − rc(x)` と同じ更新** — 抵抗の電圧はいつも
   * 入力 − コンデンサの電圧 (V_R + V_C = V_in) なので、同じ τ の `rc` と足すと入力に戻る。
   */
  | { readonly kind: 'hp'; readonly tau: number }
  /**
   * ピークホールド (τ で落ちる): `y = max(x, y·e^(−dt/τ))`。**理想のダイオードの後ろの
   * コンデンサ入力** — 入力が上ならコンデンサは入力に付いて行き、下なら負荷 (τ = RL·C) で放電する。
   */
  | { readonly kind: 'peak'; readonly tau: number }
  /**
   * 積分 (RC の積分器): `y = (1/τ)∫x dt` (台形)。**結果も V** — τ で割るので単位が変わらない。
   * 積分の定数 (始めの値) は助走の最後の 1 周期の平均を 0 にして決める (直流分の無い入力なら
   * 画面の平均が 0 になる)。入力に直流分があれば傾いて出る (理想の積分器は飽和まで上り続ける)。
   */
  | { readonly kind: 'integrate'; readonly tau: number }
  /** 時間のずれ (s、0 以上)。点の間は直線で補う。助走の前の値は最初の点の値。 */
  | { readonly kind: 'delay'; readonly seconds: number }
  /** 頭打ち。null の側は切らない (`clip 0V` は下だけ)。 */
  | { readonly kind: 'clip'; readonly low: number | null; readonly high: number | null }
  | { readonly kind: 'offset'; readonly volts: number }
  | { readonly kind: 'gain'; readonly factor: number }
  | { readonly kind: 'abs' }
  /** 符号を反転 (×−1。反転増幅器・トランスの逆の巻き方)。 */
  | { readonly kind: 'invert' };

export const OP_NAMES = ['rc', 'hp', 'peak', 'integrate', 'delay', 'clip', 'offset', 'gain', 'abs', 'invert'] as const;
export type OpName = (typeof OP_NAMES)[number];

/**
 * 操作を掛けるときの時刻の格子。`warmup` は助走の点の数 (画面はその後ろ)、`period` は
 * その ch の元の波の周期 (s。式や周期の無い波なら 0)。積分の定数を決めるのに使う。
 */
export type OpContext = { readonly dt: number; readonly warmup: number; readonly period: number };

type Apply = (input: Float64Array, context: OpContext) => Float64Array;

/** 点ごとの写像 (新しい配列)。 */
const each = (input: Float64Array, f: (value: number) => number): Float64Array => {
  const output = new Float64Array(input.length);
  for (let index = 0; index < input.length; index += 1) output[index] = f(input[index] ?? 0);
  return output;
};

/**
 * 1 次の低域。**指数の更新** (`1 − e^(−dt/τ)`)。dt が τ より粗くても発散しない。1 刻みの入力は
 * 両端の平均とみなす — 片方の端だけ使うと、段の応答が dt/2 だけ早まるか遅れる
 * (5-1 の 1 τ の値が 3 桁目でずれる)。
 */
function lowPass(input: Float64Array, dt: number, tau: number): Float64Array {
  const output = new Float64Array(input.length);
  const k = 1 - Math.exp(-dt / tau);
  let y = input[0] ?? 0;
  for (let index = 0; index < input.length; index += 1) {
    if (index > 0) y += (((input[index - 1] ?? 0) + (input[index] ?? 0)) / 2 - y) * k;
    output[index] = y;
  }
  return output;
}

function peakHold(input: Float64Array, dt: number, tau: number): Float64Array {
  const output = new Float64Array(input.length);
  const decay = Math.exp(-dt / tau);
  let y = input[0] ?? 0;
  for (let index = 0; index < input.length; index += 1) {
    if (index > 0) y = Math.max(input[index] ?? 0, y * decay);
    output[index] = y;
  }
  return output;
}

/** [from, to) の平均。 */
function meanOf(values: Float64Array, from: number, to: number): number {
  let sum = 0;
  for (let index = from; index < to; index += 1) sum += values[index] ?? 0;
  return to > from ? sum / (to - from) : 0;
}

/**
 * 台形の積分を τ で割り、**助走の最後の 1 周期の平均を 0 に**する。周期のある波が無ければ
 * 始め (助走の頭) を 0 とする。助走が 1 周期に足りなければ頭から 1 周期ぶんの平均。
 */
function integrate(input: Float64Array, context: OpContext, tau: number): Float64Array {
  const { dt, warmup, period } = context;
  const output = new Float64Array(input.length);
  let y = 0;
  for (let index = 1; index < input.length; index += 1) {
    y += (((input[index - 1] ?? 0) + (input[index] ?? 0)) / 2) * (dt / tau);
    output[index] = y;
  }
  const span = Math.min(input.length, Math.round(period / dt));
  if (span <= 0) return output;
  const from = warmup >= span ? warmup - span : 0;
  const mean = meanOf(output, from, from + span);
  return each(output, (value) => value - mean);
}

/** 時間のずれ。`x(t − seconds)` を点の間の直線で補う。 */
function delay(input: Float64Array, dt: number, seconds: number): Float64Array {
  const output = new Float64Array(input.length);
  const shift = seconds / dt;
  for (let index = 0; index < input.length; index += 1) {
    const at = index - shift;
    if (at <= 0) {
      output[index] = input[0] ?? 0;
      continue;
    }
    const i = Math.floor(at);
    const a = input[i] ?? 0;
    const b = input[i + 1] ?? a;
    output[index] = a + (b - a) * (at - i);
  }
  return output;
}

function applierOf(op: Op): Apply {
  switch (op.kind) {
    case 'rc':
      return (input, { dt }) => lowPass(input, dt, op.tau);
    case 'hp':
      return (input, { dt }) => {
        const low = lowPass(input, dt, op.tau);
        return input.map((value, index) => value - (low[index] ?? 0));
      };
    case 'peak':
      return (input, { dt }) => peakHold(input, dt, op.tau);
    case 'integrate':
      return (input, context) => integrate(input, context, op.tau);
    case 'delay':
      return (input, { dt }) => delay(input, dt, op.seconds);
    case 'clip': {
      const low = op.low ?? -Infinity;
      const high = op.high ?? Infinity;
      return (input) => each(input, (value) => Math.min(high, Math.max(low, value)));
    }
    case 'offset':
      return (input) => each(input, (value) => value + op.volts);
    case 'gain':
      // 桁あふれで factor か入力が Infinity / NaN になっても、線は 0 に落として通す
      // (呼ぶ側まで NaN / Infinity を運ばない。断るのは読みの側の役目)。
      return (input) => each(input, (value) => {
        const scaled = value * op.factor;
        return Number.isFinite(scaled) ? scaled : 0;
      });
    case 'abs':
      return (input) => each(input, Math.abs);
    case 'invert':
      return (input) => each(input, (value) => -value);
  }
}

/** 操作を書いた順に掛ける。**新しい配列を返す** (入力は書き換えない)。 */
export function applyOps(samples: Float64Array, dt: number, ops: readonly Op[], grid: Omit<OpContext, 'dt'> = { warmup: 0, period: 0 }): Float64Array {
  const context: OpContext = { dt, ...grid };
  return ops.reduce<Float64Array>((current, op) => applierOf(op)(current, context), Float64Array.from(samples));
}

/**
 * 操作の τ の和 (助走の長さを決める)。**rc・hp・peak は同じ助走** (どれも τ で定常に入る)。
 * integrate の τ は倍率なので数えない (積分は助走の 1 周期で定数を決める。`needsPeriod`)。
 */
export const tauOf = (ops: readonly Op[]): number =>
  ops.reduce((sum, op) => sum + (op.kind === 'rc' || op.kind === 'hp' || op.kind === 'peak' ? op.tau : 0), 0);

/** delay の和 (s)。助走をその分だけ伸ばす (画面の頭に、ずらす前の値が要る)。 */
export const delayOf = (ops: readonly Op[]): number =>
  ops.reduce((sum, op) => sum + (op.kind === 'delay' ? op.seconds : 0), 0);

/** 助走に 1 周期が要るか (τ で定常に入る操作か、積分の定数を決める integrate がある)。 */
export const needsPeriod = (ops: readonly Op[]): boolean => tauOf(ops) > 0 || ops.some((op) => op.kind === 'integrate');
