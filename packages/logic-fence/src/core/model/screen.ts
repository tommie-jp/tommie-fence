import { fenceError, notice, safeToken } from '../errors.ts';
import { LIMITS } from '../limits.ts';
import type { FenceDocument, FenceError } from '../types.ts';
import { buildBus } from './bus.ts';
import { readCursors, cursorsInside } from './cursors.ts';
import type { Cursor, Readings } from './cursors.ts';
import { decodeUart } from './decode.ts';
import { deviceOf } from './device.ts';
import type { Device } from './device.ts';
import { buildLanes, laneNotices } from './lanes.ts';
import type { BitRow, BusRow, DecodeRow, Row } from './rows.ts';
import { hertzText, secondsText } from './time.ts';
import { resolveTrigger } from './trigger.ts';
import type { TriggerMark } from './trigger.ts';
import { windowOf } from './window.ts';
import type { Window } from './window.ts';

/**
 * 画面 1 枚の中身。**文書 (`FenceDocument`) から、図と読み値が使う値を全部作る**。
 * 図を描く側は行と窓と印を並べるだけで、検査と計算はここで終わっている。
 */
export type Screen = {
  readonly device: Device | null;
  readonly window: Window;
  /** 時間軸を書いていない (窓は仮で、図は格子だけ)。 */
  readonly defaultedWindow: boolean;
  readonly rows: readonly Row[];
  readonly cursors: readonly Cursor[];
  readonly trigger: TriggerMark | null;
  readonly readings: Readings;
  readonly sample: number | null;
  readonly said: readonly FenceError[];
};

/** 時間軸が無いときの窓 (1 s/div)。 */
const FALLBACK_PER_DIV = 1;

function sampleNotices(doc: FenceDocument, device: Device | null, window: Window): readonly FenceError[] {
  const sample = doc.sample;
  if (sample === null || device === null) return [];
  const said: FenceError[] = [];
  if (device.maxSampleRate !== null && sample.value > device.maxSampleRate) {
    said.push(notice(`${device.label} の標本化は ${hertzText(device.maxSampleRate)} までです (${hertzText(sample.value)} と書いてあります)`, sample.line));
  }
  const count = Math.ceil((window.t1 - window.t0) * sample.value);
  if (device.buffer !== null && count > device.buffer) {
    said.push(notice(`窓 ${secondsText(window.t1 - window.t0)} を ${hertzText(sample.value)} で標本化すると 1 本あたり ${count} 標本で、${device.label} のバッファ (${device.buffer}) に入りません (Record モードが要ります)`, sample.line));
  }
  return said;
}

function decodeRows(doc: FenceDocument, lanes: readonly BitRow[], window: Window, said: FenceError[]): readonly DecodeRow[] {
  const rows: DecodeRow[] = [];
  for (const entry of doc.decode) {
    const lane = lanes.find((row) => row.name === entry.spec.lane);
    if (lane === undefined) {
      said.push(fenceError(`読み下し ${safeToken(entry.name)} のレーン ${safeToken(entry.spec.lane)} がありません (${lanes.map((row) => row.name).join(' / ') || 'まだありません'})`, entry.line, entry.spec.lane));
      continue;
    }
    const decoded = decodeUart(entry.spec, { levelAt: lane.levelAt, edges: lane.edgesIn }, window);
    if (decoded === null) {
      said.push(notice(`${safeToken(lane.name)} は edge が多すぎて uart を読み下せません (${LIMITS.edges} まで)`, entry.line));
      continue;
    }
    const { frames } = decoded;
    if (decoded.partial) said.push(notice(`${safeToken(entry.name)}: 窓の左端で線が low のため、窓より前から始まったフレームは読み下しから外しました (線が 1 フレーム分 high になるまで読みません)`, entry.line));
    if (frames.length === 0) said.push(notice(`${safeToken(entry.name)}: 窓の中に完結した uart のフレームがありません`, entry.line));
    // 誤りのあるフレームは 1 つのお知らせにまとめる (ノイズの列で何十件も並べない)。
    const broken = frames.filter((frame) => frame.error !== null);
    const first = broken[0];
    if (first !== undefined) {
      said.push(notice(`${safeToken(entry.name)}: ${frames.length} フレーム中 ${broken.length} 個に ${first.error === 'parity' ? 'パリティ' : 'ストップビット'}の誤りがあります (最初は ${secondsText(first.t0)}。baud と形式を確かめます)`, entry.line));
    }
    const { spec } = entry;
    rows.push({
      kind: 'decode', name: entry.name, line: entry.line,
      protocol: `uart ${spec.baud} ${spec.dataBits}${spec.parity}${spec.stopBits}`,
      frames,
      frameAt: (t) => frames.find((frame) => t >= frame.t0 && t < frame.t1) ?? null,
    });
  }
  return rows;
}

export function screenOf(doc: FenceDocument): Screen {
  const device = doc.device === null ? null : deviceOf(doc.device);
  const said: FenceError[] = [];
  // **範囲の外の窓は仮の窓に戻す** — 桁あふれで座標が NaN や Infinity になる (格子は必ず描く)。
  const span = doc.time === null ? null : doc.time.value.perDiv * LIMITS.divisions;
  const timeOk = span !== null && span <= LIMITS.windowMax && span >= LIMITS.windowMin * LIMITS.divisions;
  if (doc.time !== null && !timeOk) {
    said.push(fenceError(`窓は ${secondsText(LIMITS.windowMin * LIMITS.divisions)}〜${secondsText(LIMITS.windowMax)} にします (1 目盛は ${secondsText(LIMITS.windowMin)}〜${secondsText(LIMITS.windowMax / LIMITS.divisions)})`, doc.time.line));
  }
  const startOk = doc.start === null || Math.abs(doc.start.value) <= LIMITS.windowMax;
  if (doc.start !== null && !startOk) {
    said.push(fenceError(`start: は ±${secondsText(LIMITS.windowMax)} までです`, doc.start.line));
  }
  const perDiv = timeOk && doc.time !== null ? doc.time.value.perDiv : FALLBACK_PER_DIV;
  const window = windowOf(startOk ? doc.start?.value ?? 0 : 0, perDiv);
  const lanes = buildLanes(doc, device, window);
  said.push(...lanes.said, ...laneNotices(lanes.rows, window, doc.sample?.value ?? null), ...sampleNotices(doc, device, window));
  const buses: BusRow[] = [];
  const taken = new Set(lanes.rows.map((row) => row.name));
  const claim = (name: string, line: number | null): boolean => {
    if (taken.has(name)) {
      said.push(fenceError(`名前 ${safeToken(name)} が重なっています (レーン・バス・読み下しで 1 つずつ)`, line, name));
      return false;
    }
    taken.add(name);
    return true;
  };
  for (const entry of doc.buses) {
    if (!claim(entry.name, entry.line)) continue;
    const built = buildBus(entry, lanes.rows, window);
    said.push(...built.said);
    if (built.row !== null) buses.push(built.row);
  }
  const decodes = decodeRows({ ...doc, decode: doc.decode.filter((entry) => claim(entry.name, entry.line)) }, lanes.rows, window, said);
  const rows: readonly Row[] = [...lanes.rows, ...buses, ...decodes];
  const triggered = resolveTrigger(doc.trigger, lanes.rows, window);
  said.push(...triggered.said);
  const cursors = cursorsInside(doc.cursors, window, said);
  return {
    device, window, defaultedWindow: doc.time === null || !timeOk, rows, cursors, trigger: triggered.mark,
    readings: readCursors(cursors, rows), sample: doc.sample?.value ?? null, said,
  };
}
