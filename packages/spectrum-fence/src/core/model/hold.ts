import { formatHertzShort } from 'fence-kit';
import type { WaveSpec } from 'fence-kit';
import { notice } from '../errors.ts';
import type { FenceError } from '../types.ts';
import type { Point } from './trace.ts';

/**
 * MAX HOLD。**実機が掃引を重ねて、点ごとの最大を残す**のを、書いた掃引の並びから計算する。
 * `hold:` の 1 つは、1 回の掃引 (波の和) か、波を `from..to` で動かしたときの掃引の並び。
 * 掃引ごとに同じ道 (掃引型は受信機、FFT 型は窓と FFT) で点を作り、点ごとの最大を取る —
 * だからマーカーは、実機のマーカーが保持したトレースを読むのと同じ算法で読める。
 */
export type HoldEntry =
  | { readonly kind: 'waves'; readonly waves: readonly WaveSpec[]; readonly line: number | null }
  | {
    readonly kind: 'tune';
    /** `from` にあるときの波 (形・振幅・duty はそのまま動かす)。 */
    readonly wave: WaveSpec;
    readonly from: number;
    readonly to: number;
    /** 書いた刻み。null は掃引の点ごと (FFT 型は必ず書く)。 */
    readonly step: number | null;
    readonly line: number | null;
  };

/** 同じ高さとみなす差 (dB)。 */
const TIE = 1e-9;

/**
 * 点ごとの最大。**同じ高さなら後のトレースを残す** (`from..to` の終わりの端で、線の上に立った点が
 * 掃引の点の周波数ではなく線の周波数を読ませる)。トレースが無ければ空。
 */
export function envelopeOf(traces: readonly (readonly Point[])[]): readonly Point[] {
  const [first, ...rest] = traces;
  if (first === undefined) return [];
  return rest.reduce<readonly Point[]>(
    (held, trace) => held.map((point, index) => {
      const other = trace[index];
      return other !== undefined && other.level > point.level - TIE ? other : point;
    }),
    first,
  );
}

export type HoldRoom = {
  /** 掃引の点の周波数 (掃引型)。FFT 型は空。 */
  readonly grid: readonly number[];
  /** 掃引型の RBW。FFT 型は null。 */
  readonly rbw: number | null;
  /** 積める掃引の数の上限。 */
  readonly cap: number;
};

export type Snapshots = { readonly waves: readonly (readonly WaveSpec[])[]; readonly said: readonly FenceError[] };

/** 動かす波の位置。刻みを書かなければ掃引の点ごと (両端を含む)、書けばその刻みで終わりの `to` まで。 */
function positionsOf(entry: Extract<HoldEntry, { kind: 'tune' }>, room: HoldRoom, limit: number): readonly number[] {
  const { from, to, step } = entry;
  if (step === null) {
    const inside = room.grid.filter((f) => f > from && f < to);
    // 両端を最後に置く (同じ高さなら後が残るので、端の点は線の周波数を読ませる)。
    return [...inside, from, to].slice(0, limit);
  }
  const count = Math.min(limit, Math.ceil((to - from) / step - 1e-9) + 1);
  return Array.from({ length: count }, (_, index) => Math.min(from + index * step, to));
}

const moved = (entry: Extract<HoldEntry, { kind: 'tune' }>, f: number): readonly WaveSpec[] => [{ ...entry.wave, frequency: f }];

const coarse = (entry: Extract<HoldEntry, { kind: 'tune' }>, rbw: number | null): FenceError | null =>
  (entry.step !== null && rbw !== null && entry.step > rbw
    ? notice(`刻み ${formatHertzShort(entry.step)} は RBW ${formatHertzShort(rbw)} より粗いので、山がつながらず櫛のように離れて見えます (連続して動く線は RBW 以下の刻みか、刻みを書かずに)`, entry.line)
    : null);

/** `hold:` の並びを、掃引ごとの波の和の並びに直す。**上限を超えたら打ち切って言う。** */
export function snapshotsOf(entries: readonly HoldEntry[], room: HoldRoom): Snapshots {
  const sets: (readonly WaveSpec[])[] = [];
  const said: FenceError[] = [];
  let cut = false;
  for (const entry of entries) {
    const left = room.cap - sets.length;
    if (left <= 0) {
      cut = true;
      break;
    }
    if (entry.kind === 'waves') {
      sets.push(entry.waves);
      continue;
    }
    const positions = positionsOf(entry, room, left + 1);
    cut ||= positions.length > left;
    sets.push(...positions.slice(0, left).map((f) => moved(entry, f)));
    const warned = coarse(entry, room.rbw);
    if (warned !== null) said.push(warned);
  }
  if (cut) said.push(notice(`hold: の掃引が多すぎるので ${room.cap} 掃引で打ち切りました`, entries[0]?.line ?? null));
  return { waves: sets, said };
}

/** 積んだ掃引と (あれば) 今の掃引の、点ごとの最大。 */
export function heldTrace(
  sets: readonly (readonly WaveSpec[])[],
  live: readonly Point[] | null,
  compute: (waves: readonly WaveSpec[]) => readonly Point[],
): readonly Point[] {
  return envelopeOf([...(live === null ? [] : [live]), ...sets.map(compute)]);
}
