import { formatHertzReading, formatHertzShort } from 'fence-kit';
import { notice } from '../errors.ts';
import { LIMITS } from '../limits.ts';
import type { FenceDocument, FenceError } from '../types.ts';
import type { Device, LevelUnit } from './device.ts';
import { SYNTH_BUDGET, fftTrace, resolutionOf } from './fftTrace.ts';
import { fromUnit, toUnit, dbvFromDbm, formatSetting } from './level.ts';
import { autoRbw, floorOf, inputNotice, rbwProblem } from './receiver.ts';
import { linesOfSignal, peakOf } from './signal.ts';
import { deviceSweep, rangeNotice, snapPoints } from './sweep.ts';
import type { SweepText } from './sweep.ts';
import { sweptTrace } from './sweptTrace.ts';
import type { Point } from './trace.ts';

/**
 * 画面の中身を計算する — **機種の型で道を分ける** (FFT 型は窓と FFT、掃引型は線と受信機)。
 * 補った既定のうち**図の中身を決める物は言う** (`sweep:` `samples:` `window:` `points:`
 * `rbw:` の auto、generic のフロア)。見た目 (`ref:` `scale:` `unit:`) は状態の行と目盛に出るので言わない。
 */
export type Screen = {
  readonly start: number;
  readonly stop: number;
  readonly centered: boolean;
  readonly unit: LevelUnit;
  /** 上端 (表示の単位)。 */
  readonly ref: number;
  readonly scale: number;
  /** 理想の点の列 (表示の単位)。描く物が無ければ空。 */
  readonly points: readonly Point[];
  /** 状態の行の字。1 行目 (機種と掃引) と 2 行目 (受信機と表示)。 */
  readonly status: readonly [readonly string[], readonly string[]];
  readonly said: readonly FenceError[];
  readonly errors: readonly FenceError[];
};

/** FFT 型の窓の既定 (WaveForms の既定は Flat-top と記憶 — 要確認)。 */
export const DEFAULT_WINDOW = 'flattop';
/** 目盛 1 つの既定 (dB)。 */
export const DEFAULT_SCALE = 10;

const WINDOW_LABEL = { rect: 'Rectangular', hann: 'Hann', flattop: 'Flat Top' } as const;

const hz = (f: number): string => formatHertzShort(f);

/** 掃引の字 (`START 0 Hz` `STOP 960 MHz` か `CENTER 30 MHz` `SPAN 2 MHz`)。 */
const sweepWords = (sweep: SweepText, centered: boolean): readonly string[] => (centered
  ? [`CENTER ${hz((sweep.start + sweep.stop) / 2)}`, `SPAN ${hz(sweep.stop - sweep.start)}`]
  : [`START ${hz(sweep.start)}`, `STOP ${hz(sweep.stop)}`]);

type Common = { readonly sweep: SweepText; readonly centered: boolean; readonly unit: LevelUnit; readonly ref: number; readonly scale: number };

function common(doc: FenceDocument, device: Device, said: FenceError[]): Common {
  const sweep = doc.sweep?.value ?? deviceSweep(device);
  if (doc.sweep === null) said.push(notice(`sweep: が無いので ${device.label} の範囲 (${hz(sweep.start)}〜${hz(sweep.stop)}) で描いています`, null));
  const outside = rangeNotice(device, sweep.start, sweep.stop);
  if (outside !== null) said.push(notice(outside, doc.sweep?.line ?? null));
  const unit = doc.unit?.value ?? device.defaultUnit;
  const ref = doc.ref === null
    ? toUnit(fromUnit(device.defaultRef, device.defaultUnit), unit)
    : toUnit(fromUnit(doc.ref.value.value, doc.ref.value.unit), unit);
  return { sweep, centered: doc.sweep?.value.centered ?? false, unit, ref: Math.round(ref * 100) / 100, scale: doc.scale?.value ?? DEFAULT_SCALE };
}

const display = (c: Common): readonly string[] => [`REF ${formatSetting(c.ref, c.unit)}`, `${formatSetting(c.scale, 'dB')}/div`];

function fftScreen(doc: FenceDocument, device: Device, c: Common, said: FenceError[]): Screen {
  // samples: と window: の既定は、計算する物 (signal: か floor:) があるときだけ言う (図の中身を決めないので)。
  const computes = doc.signal.length > 0 || doc.floor !== null;
  const samples = doc.samples?.value ?? device.samples?.default ?? 8192;
  if (doc.samples === null && computes) said.push(notice(`samples: が無いので ${samples} で描いています`, null));
  const window = doc.window?.value ?? DEFAULT_WINDOW;
  if (doc.window === null && computes) said.push(notice(`window: が無いので ${window} で描いています`, null));
  const { start, stop } = c.sweep;
  const df = resolutionOf(stop, samples);
  const bins = Math.floor((stop - start) / df) + 1;
  if (bins < 20) {
    said.push(notice(`分解能 (${formatHertzReading(df)}) に比べて掃引が狭いので bin が ${bins} 個しかありません (samples: を増やすか掃引を広くします)`, doc.sweep?.line ?? null));
  }
  const signal = doc.signal.map((one) => one.value);
  const limit = device.maxInput?.volts;
  if (limit !== undefined && peakOf(signal) > limit) {
    said.push(notice(`入力の上限 ±${limit} V を超えています (波の peak の和が ${peakOf(signal).toFixed(1)} V)`, doc.signal[0]?.line ?? null));
  }
  const floor = doc.floor === null ? null : fromUnit(doc.floor.value.value, doc.floor.value.unit);
  const read = signal.length === 0 && floor === null ? null : fftTrace({ signal, start, stop, samples, window, floor });
  if (read?.truncated === true) said.push(notice(`線が多すぎるので Nyquist より下の ${Math.floor(SYNTH_BUDGET / samples)} 本で打ち切りました`, doc.signal[0]?.line ?? null));
  const points = (read?.points ?? []).map((point) => ({ ...point, level: toUnit(point.level, c.unit) }));
  const first = [device.label, `${hz(start)}〜${hz(stop)}`, `${samples} pt`, `分解能 ${formatHertzReading(df)}`, WINDOW_LABEL[window]];
  return {
    start, stop, centered: c.centered, unit: c.unit, ref: c.ref, scale: c.scale, points,
    status: [first, display(c)], said, errors: [],
  };
}

function sweptScreen(doc: FenceDocument, device: Device, c: Common, said: FenceError[]): Screen {
  const errors: FenceError[] = [];
  const written = c.sweep.points ?? doc.points?.value ?? null;
  const fallback = device.points?.default ?? 450;
  if (written === null) said.push(notice(`points: が無いので ${fallback} 点で描いています`, null));
  const snapped = snapPoints(device, written ?? fallback);
  if (snapped.said !== null) said.push(notice(snapped.said, doc.points?.line ?? doc.sweep?.line ?? null));
  const points = snapped.points;
  const { start, stop } = c.sweep;
  const auto = autoRbw(device, stop - start, points);
  const problem = doc.rbw === null ? null : rbwProblem(device, doc.rbw.value);
  if (problem !== null) errors.push({ message: problem, line: doc.rbw?.line ?? null });
  const rbw = doc.rbw === null || problem !== null ? auto : doc.rbw.value;
  if (doc.rbw === null) said.push(notice(`rbw: が無いので ${hz(rbw)} (掃引の幅 ÷ 点数から選んだ値) で描いています`, null));
  const atten = doc.atten?.value ?? 0;
  const lna = doc.lna?.value ?? false;
  const writtenFloor = doc.floor === null ? null : toUnit(fromUnit(doc.floor.value.value, doc.floor.value.unit), 'dBm');
  if (device.danl === undefined && writtenFloor === null) {
    said.push(notice(`${device.label} のフロアは floor: で書きます (いまは ${formatSetting(floorOf(device, rbw, 0, false, null), 'dBm')} で描いています)`, null));
  }
  const floor = floorOf(device, rbw, atten, lna, writtenFloor);
  const read = linesOfSignal(doc.signal.map((one) => one.value), stop + 5 * rbw, LIMITS.lines);
  if (read.truncated) said.push(notice(`線が多すぎるので ${LIMITS.lines} 本で打ち切りました`, doc.signal[0]?.line ?? null));
  const tooMuch = inputNotice(device, read.lines);
  if (tooMuch !== null) said.push(notice(tooMuch, doc.signal[0]?.line ?? null));
  const trace = sweptTrace({ lines: read.lines, start, stop, points, rbw, floor })
    .map((point) => ({ ...point, level: toUnit(dbvFromDbm(point.level), c.unit) }));
  const first = [device.label, ...sweepWords(c.sweep, c.centered), `${points} pt`];
  const second = [`RBW ${hz(rbw)}`, `ATT ${formatSetting(atten, 'dB')}`, ...(lna ? ['LNA'] : []), ...display(c)];
  return {
    start, stop, centered: c.centered, unit: c.unit, ref: c.ref, scale: c.scale, points: trace,
    status: [first, second], said, errors,
  };
}

export function screenOf(doc: FenceDocument, device: Device): Screen {
  const said: FenceError[] = [];
  const c = common(doc, device, said);
  return device.kind === 'fft' ? fftScreen(doc, device, c, said) : sweptScreen(doc, device, c, said);
}
