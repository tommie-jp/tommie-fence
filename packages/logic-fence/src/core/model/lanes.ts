import { fenceError, notice, safeToken } from '../errors.ts';
import { LIMITS } from '../limits.ts';
import type { FenceError, FenceDocument } from '../types.ts';
import type { Device } from './device.ts';
import type { BitRow } from './rows.ts';
import { counterBit, countedEdges, waveOf } from './wave.ts';
import type { CounterSpec, Wave } from './wave.ts';
import { PLOT, minGapSeconds } from './window.ts';
import type { Window } from './window.ts';
import { axisLabel, axisUnit, secondsText } from './time.ts';

/**
 * `signals:` を 1 本ずつのレーンにする。**ここで言うこと**: 名前の重なり・DIO の番号の外や重なり・
 * 本数の上限・counter の元のレーンや値の範囲。密なレーン (変わり目が 3 px より近い) と、
 * 標本化の検査 (`sample:`) のお知らせもここ。
 */
export type Built = { readonly rows: readonly BitRow[]; readonly said: readonly FenceError[] };

const laneRow = (
  name: string, dio: number | null, line: number | null, wave: Wave, window: Window,
): BitRow => {
  const transitions = wave.edges(window.t0, window.t1, LIMITS.edges);
  const gaps = (transitions ?? []).slice(1).map((edge, index) => edge.t - (transitions?.[index]?.t ?? edge.t));
  const minGap = gaps.length === 0 ? null : Math.min(...gaps);
  const dense = transitions === null || (minGap !== null && minGap < minGapSeconds(window));
  return { kind: 'bit', name, dio, line, levelAt: wave.levelAt, edgesIn: wave.edges, initial: wave.levelAt(window.t0), transitions, dense, minGap };
};

function counterProblem(spec: CounterSpec, width: number): string | null {
  const limit = 2 ** width;
  const values = spec.sequence ?? [];
  const over = values.find((value) => value >= limit);
  if (over !== undefined) return `sequence の ${over} は ${width} bit (0〜${limit - 1}) に入りません`;
  if (spec.wrap !== null && spec.wrap > limit) return `wrap ${spec.wrap} は ${width} bit (0〜${limit - 1}) を越えます`;
  if (spec.start >= (spec.wrap ?? limit)) return `start ${spec.start} は ${spec.wrap === null ? `${width} bit` : `wrap ${spec.wrap}`} の範囲に入りません`;
  return null;
}

export function buildLanes(doc: FenceDocument, device: Device | null, window: Window): Built {
  const said: FenceError[] = [];
  const rows: BitRow[] = [];
  const waves = new Map<string, Wave>();
  const dioOf = new Map<number, string>();
  const channels = device?.channels ?? LIMITS.lanes;

  const claim = (name: string, dio: number | null, line: number | null): boolean => {
    if (waves.has(name)) {
      said.push(fenceError(`レーンの名前 ${safeToken(name)} が重なっています`, line, name));
      return false;
    }
    if (rows.length >= channels) {
      said.push(fenceError(`レーンは ${channels} 本までです${device === null ? '' : ` (${device.label})`}`, line, name));
      return false;
    }
    if (dio !== null) {
      const other = dioOf.get(dio);
      if (dio >= channels) {
        said.push(fenceError(`dio${dio} は使えません (${device?.label ?? 'この機種'} は dio0〜dio${channels - 1})`, line, `dio${dio}`));
        return false;
      }
      if (other !== undefined) {
        said.push(fenceError(`dio${dio} は ${safeToken(other)} が使っています (${safeToken(name)} と重なります)`, line, `dio${dio}`));
        return false;
      }
      dioOf.set(dio, name);
    }
    return true;
  };

  for (const entry of doc.signals) {
    const { spec, dio, line } = entry;
    if (spec.kind !== 'counter') {
      if (dio !== null && dio.to !== dio.from) {
        said.push(fenceError('dio1..dio4 のような範囲を書けるのは counter だけです (1 本のレーンは dio3 のように 1 つ)', line, `dio${dio.from}..dio${dio.to}`));
        continue;
      }
      if (!claim(entry.name, dio?.from ?? null, line)) continue;
      const wave = waveOf(spec);
      waves.set(entry.name, wave);
      rows.push(laneRow(entry.name, dio?.from ?? null, line, wave, window));
      continue;
    }
    const width = dio === null ? spec.bits : dio.to - dio.from + 1;
    if (width === null) {
      said.push(fenceError('counter は幅を書きます (dio1..dio4 の範囲か、bits 4)', line, entry.name));
      continue;
    }
    if (dio !== null && spec.bits !== null && spec.bits !== width) {
      said.push(fenceError(`bits ${spec.bits} と dio${dio.from}..dio${dio.to} (${width} 本) が合いません`, line, `${spec.bits}`));
      continue;
    }
    const source = waves.get(spec.on);
    if (source === undefined) {
      const names = [...waves.keys()];
      said.push(fenceError(`counter の元のレーン ${safeToken(spec.on)} がありません (前に書いたレーンだけ。${names.length === 0 ? 'まだ 1 本もありません' : names.join(' / ')})`, line, spec.on));
      continue;
    }
    const problem = counterProblem(spec, width);
    if (problem !== null) {
      said.push(fenceError(`counter: ${problem}`, line));
      continue;
    }
    const slack = (window.t1 - window.t0) * 1e-9;
    const counted = countedEdges(source, spec.edge, window.t0 - slack, window.t1, LIMITS.edges);
    if (counted === null) {
      said.push(fenceError(`counter の元のレーン ${safeToken(spec.on)} は edge が多すぎて数えられません (窓の中で ${LIMITS.edges} まで。counter の出力を元にできるのは start: が 0 のときだけ)`, line, spec.on));
      continue;
    }
    // 窓の右端ちょうどの edge は画面に出ない (数えない)。
    const visible = counted.prefix + counted.times.filter((t) => t < window.t1 - slack).length;
    if (spec.sequence !== null && !spec.repeat && visible > spec.sequence.length) {
      said.push(notice(`sequence は ${spec.sequence.length} 個ですが edge は ${visible} 回あります (最後の値を保ちます。繰り返すなら repeat)`, line));
    }
    for (let bit = 0; bit < width; bit += 1) {
      const name = `${entry.name}${bit}`;
      if (!claim(name, dio === null ? null : dio.from + bit, line)) continue;
      const wave = counterBit(spec, width, bit, counted.prefix, counted.times, window.t0 - slack);
      waves.set(name, wave);
      rows.push(laneRow(name, dio === null ? null : dio.from + bit, line, wave, window));
    }
  }
  return { rows, said };
}

/** 変わり目が 3 px より近くて塗りで描くレーンと、標本化より短い区間のお知らせ。 */
export function laneNotices(rows: readonly BitRow[], window: Window, sample: number | null): readonly FenceError[] {
  const unit = axisUnit(window.perDiv);
  const said: FenceError[] = [];
  for (const row of rows) {
    if (row.dense) {
      const gap = row.minGap === null ? '' : `最短 ${secondsText(row.minGap)}、`;
      said.push(notice(
        `${safeToken(row.name)} は変わり目が ${PLOT.minGapPx} px より近く (${gap}1 目盛 = ${axisLabel(window.perDiv, unit)})、線では読めないので塗りで描きました。time: を細かくするか、窓を狭めます`,
        row.line,
      ));
    } else if (sample !== null && row.minGap !== null && row.minGap < 2 / sample) {
      said.push(notice(
        `${safeToken(row.name)} の最短の区間 ${secondsText(row.minGap)} は標本化 ${secondsText(1 / sample)} の 2 標本より短く、実機では捉えきれません`,
        row.line,
      ));
    }
  }
  return said;
}
