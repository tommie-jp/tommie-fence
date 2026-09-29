import type { Direction, SignalSpec } from './signalSpec.ts';

/**
 * 1 本のレーンの高低。**時間の関数** (`levelAt`) と、窓の中の変わり目 (`edges`) の 2 つの道を持つ。
 * 読み値 (カーソル) は `levelAt`、絵は `edges` — **同じ波から両方を出す**ので食い違わない。
 *
 * 約束:
 * - **変わり目ちょうどの時刻では新しい値** (`levelAt(edge.t) === edge.v`)
 * - `edges(lo, hi, cap)` は **`lo` を含まず `hi` を含む** (`lo` ちょうどの変化は `levelAt(lo)` に入っている)
 * - `cap` を越えるなら null (密すぎて数え上げない)
 */
export type Level = 0 | 1;
export type Transition = { readonly t: number; readonly v: Level };

export type Wave = {
  readonly levelAt: (t: number) => Level;
  readonly edges: (lo: number, hi: number, cap: number) => readonly Transition[] | null;
  /**
   * t ≥ 0 の edge のうち、値が `value` になるもの (`v === value`) の、時刻 `t` 以下の個数。
   * **周期の波は式で O(1)** (窓が t = 0 から遠くても counter が数えられる)。無ければ `edges` から数える。
   */
  readonly countTo?: (value: Level, t: number) => number;
};

/** 周期の数え上げで、境目ちょうどが浮動小数の誤差で隣に落ちないための幅 (周期に対する割合)。 */
const SLACK = 1e-9;

/** 昇順の時刻の列のうち `t` 以下の個数 (二分探索)。変わり目の数が多くても読み値を O(log n) で引く。 */
export function countUpTo(times: readonly number[], t: number): number {
  let low = 0;
  let high = times.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if ((times[middle] ?? Infinity) <= t) low = middle + 1;
    else high = middle;
  }
  return low;
}

const constant = (level: Level): Wave => ({ levelAt: () => level, edges: () => [] });

function clock(frequency: number, duty: number): Wave {
  const period = 1 / frequency;
  /** k ≥ 0 で `(k + offset) * period <= t` になる k の個数。**`edges` と同じ式**で境目を判じる (二重に数えない)。 */
  const countTo = (offset: number, t: number): number => {
    let k = Math.floor(t / period - offset);
    while ((k + 1 + offset) * period <= t) k += 1;
    while (k >= 0 && (k + offset) * period > t) k -= 1;
    return Math.max(0, k + 1);
  };
  return {
    countTo: (value, t) => countTo(value === 1 ? 0 : duty, t),
    levelAt: (t) => {
      const cycles = t / period;
      return cycles - Math.floor(cycles + SLACK) + SLACK < duty ? 1 : 0;
    },
    edges: (lo, hi, cap) => {
      if (((hi - lo) / period) * 2 + 4 > cap) return null;
      const found: Transition[] = [];
      for (let cycle = Math.floor(lo / period) - 1; cycle * period <= hi + period; cycle += 1) {
        const rising = cycle * period;
        const falling = (cycle + duty) * period;
        if (rising > lo && rising <= hi) found.push({ t: rising, v: 1 });
        if (falling > lo && falling <= hi) found.push({ t: falling, v: 0 });
      }
      return found;
    },
  };
}

const sorted = (transitions: readonly Transition[], lo: number, hi: number): readonly Transition[] =>
  transitions.filter((edge) => edge.t > lo && edge.t <= hi);

function pulse(at: number, width: number): Wave {
  const end = at + width;
  return {
    levelAt: (t) => (t >= at - SLACK * width && t < end - SLACK * width ? 1 : 0),
    edges: (lo, hi) => sorted([{ t: at, v: 1 }, { t: end, v: 0 }], lo, hi),
  };
}

function pattern(bits: string, bitTime: number, from: number, repeat: boolean): Wave {
  const length = bits.length;
  const bit = (index: number): Level => {
    const at = index < 0 ? 0 : repeat ? index % length : Math.min(index, length - 1);
    return bits[at] === '1' ? 1 : 0;
  };
  const indexAt = (t: number): number => Math.floor((t - from) / bitTime + SLACK);
  return {
    levelAt: (t) => bit(indexAt(t)),
    edges: (lo, hi, cap) => {
      const last = repeat ? Math.ceil((hi - from) / bitTime) : Math.min(length - 1, Math.ceil((hi - from) / bitTime));
      const first = Math.max(1, Math.floor((lo - from) / bitTime));
      if (last - first > cap) return null;
      const found: Transition[] = [];
      for (let index = first; index <= last; index += 1) {
        const t = from + index * bitTime;
        if (t > lo && t <= hi && bit(index) !== bit(index - 1)) found.push({ t, v: bit(index) });
      }
      return found;
    },
  };
}

function fromPairs(pairs: readonly (readonly [number, Level])[]): Wave {
  const transitions: Transition[] = [];
  let level: Level = pairs[0]?.[1] ?? 0;
  for (const [t, v] of pairs.slice(1)) {
    if (v !== level) transitions.push({ t, v });
    level = v;
  }
  const first: Level = pairs[0]?.[1] ?? 0;
  const times = transitions.map((edge) => edge.t);
  return {
    levelAt: (t) => transitions[countUpTo(times, t) - 1]?.v ?? first,
    edges: (lo, hi) => sorted(transitions, lo, hi),
  };
}

/**
 * 数える edge (`rising` は 0→1、`falling` は 1→0)。**t ≥ 0 の edge だけ**数える。
 * `prefix` は窓の左 (`lo`) までの個数 (式か列挙で出す)、`times` は `(lo, hi]` の edge の時刻。
 * 数えきれなければ null。
 */
export type CountedEdges = { readonly prefix: number; readonly times: readonly number[] };

export function countedEdges(source: Wave, direction: Direction, lo: number, hi: number, cap: number): CountedEdges | null {
  const wanted: Level = direction === 'rising' ? 1 : 0;
  let prefix = 0;
  if (lo > 0) {
    if (source.countTo !== undefined) {
      prefix = source.countTo(wanted, lo);
    } else {
      const before = source.edges(-1e-30, lo, cap);
      if (before === null) return null;
      prefix = before.filter((edge) => edge.v === wanted).length;
    }
  }
  const inside = source.edges(Math.max(lo, -1e-30), hi, cap);
  if (inside === null) return null;
  return { prefix, times: inside.filter((edge) => edge.v === wanted).map((edge) => edge.t) };
}

/**
 * counter の値の並び。i 番目の edge の**直後**の値が `value(i)` (最初の edge の直後が start か sequence の先頭)。
 * 最初の edge より前も `value(0)`。
 */
export type CounterSpec = Extract<SignalSpec, { readonly kind: 'counter' }>;

export function counterValue(spec: CounterSpec, width: number, index: number): number {
  const at = Math.max(0, index);
  if (spec.sequence !== null) {
    const length = spec.sequence.length;
    return spec.sequence[spec.repeat ? at % length : Math.min(at, length - 1)] ?? 0;
  }
  return (spec.start + at) % (spec.wrap ?? 2 ** width);
}

/**
 * counter の 1 ビットぶんの波。`prefix` は窓の左までに数えた edge の個数、`times` はその後 (窓の中) の edge の時刻 (昇順)。
 * `knownFrom` より左の変わり目は持っていないので、そこを尋ねられたら null (数えられない) と答える。
 */
export function counterBit(spec: CounterSpec, width: number, bit: number, prefix: number, times: readonly number[], knownFrom: number): Wave {
  const bitOf = (index: number): Level => ((counterValue(spec, width, index) >> bit) & 1) as Level;
  return {
    levelAt: (t) => bitOf(prefix + countUpTo(times, t) - 1),
    edges: (lo, hi) => {
      if (lo < knownFrom) return null;
      const found: Transition[] = [];
      times.forEach((t, index) => {
        const at = prefix + index;
        if (at > 0 && bitOf(at) !== bitOf(at - 1) && t > lo && t <= hi) found.push({ t, v: bitOf(at) });
      });
      return found;
    },
  };
}

/** counter 以外の波を作る。counter は `counterBit` で束ねる。 */
export function waveOf(spec: Exclude<SignalSpec, CounterSpec>): Wave {
  switch (spec.kind) {
    case 'clock': return clock(spec.frequency, spec.duty);
    case 'pulse': return pulse(spec.at, spec.width);
    case 'pattern': return pattern(spec.bits, spec.bitTime, spec.from, spec.repeat);
    case 'level': return constant(spec.level);
    case 'edges': return fromPairs(spec.pairs);
  }
}
