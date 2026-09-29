import { LIMITS } from '../limits.ts';
import { fail, ok, wordsOf } from './read.ts';
import type { Read } from './read.ts';
import type { Wave } from './wave.ts';
import type { Window } from './window.ts';

/**
 * プロトコルの読み下し (WaveForms の Logic の Interpreter)。**この版は UART だけ** —
 * SPI と I2C はまだ書けない (docs/01-syntax.md の「将来」)。
 * 書き方は `decode: { 名前: uart レーン baud 9600 8N1 [hex|ascii] }`。
 * アイドルは high、スタートビットは low、データは LSB が先。
 */
export type DecodeSpec = {
  readonly kind: 'uart';
  readonly lane: string;
  readonly baud: number;
  readonly dataBits: number;
  readonly parity: 'N' | 'E' | 'O';
  readonly stopBits: 1 | 2;
  readonly show: 'hex' | 'ascii';
};

export const DECODE_HINT = 'decode: の値は「uart レーン名 baud 9600 8N1」で書きます (末尾に ascii か hex。SPI と I2C はまだ書けません)';

const FORMAT = /^([5-8])([NEO])([12])$/i;

export function parseDecode(text: string): Read<DecodeSpec> {
  const words = wordsOf(text);
  const kind = words[0];
  if (kind === 'spi' || kind === 'i2c') return fail(`${kind} の読み下しはまだ書けません (この版で書けるのは uart)`, kind);
  if (kind !== 'uart') return fail(DECODE_HINT, kind);
  const lane = words[1];
  if (lane === undefined || words[2] !== 'baud') return fail(DECODE_HINT);
  const baud = /^\d+$/.test(words[3] ?? '') ? Number(words[3]) : null;
  if (baud === null || baud < 50 || baud > 10_000_000) return fail('baud は 50〜10000000 の整数で書きます (例: baud 9600)', words[3]);
  const format = FORMAT.exec(words[4] ?? '');
  if (format === null) return fail('形式は 8N1 のように 「データ 5〜8 bit・パリティ N/E/O・ストップ 1/2」で書きます', words[4]);
  const show = words[5];
  if (words.length > 6 || (show !== undefined && show !== 'hex' && show !== 'ascii')) return fail('最後に書けるのは hex か ascii だけです', show ?? words[6]);
  return ok({
    kind: 'uart', lane, baud, dataBits: Number(format[1]), parity: (format[2] ?? 'N').toUpperCase() as 'N' | 'E' | 'O',
    stopBits: format[3] === '2' ? 2 : 1, show: show === 'ascii' ? 'ascii' : 'hex',
  });
}

export type Frame = {
  readonly t0: number;
  readonly t1: number;
  readonly value: number;
  /** 箱に書く字。 */
  readonly text: string;
  /** 形式の誤り (`parity` `framing`)。 */
  readonly error: 'parity' | 'framing' | null;
};

const printable = (value: number): boolean => value >= 0x20 && value <= 0x7e;

const frameText = (value: number, spec: DecodeSpec): string =>
  (spec.show === 'ascii' && printable(value) ? `'${String.fromCharCode(value)}'` : `0x${value.toString(16).toUpperCase().padStart(2, '0')}`);

export type Decoded = {
  readonly frames: readonly Frame[];
  /** 窓の左端で線が low だった (窓より前から始まったフレームの途中)。そのフレームは読み下さない。 */
  readonly partial: boolean;
};

/**
 * 窓の中の UART のフレーム。**窓に全部入るものだけ**。数え切れないほど密なら null。
 *
 * 窓の左端で線が low なら、窓より前から始まったフレームの途中で、どこがスタートビットか分からない。
 * **データの中の立ち下がりをスタートビットに取らない** — 線が 1 フレーム分以上 high のまま
 * (アイドル) になってから、最初のスタートビットを探す。
 */
export function decodeUart(spec: DecodeSpec, wave: Wave, window: Window): Decoded | null {
  const bit = 1 / spec.baud;
  const slack = bit * 1e-6;
  const edges = wave.edges(window.t0 - slack, window.t1, LIMITS.edges);
  if (edges === null) return null;
  const parityBits = spec.parity === 'N' ? 0 : 1;
  const length = (1 + spec.dataBits + parityBits + spec.stopBits) * bit;
  const partial = wave.levelAt(window.t0 - bit * 1e-3) === 0;
  const frames: Frame[] = [];
  let free = window.t0 - slack;
  // 同期がまだ取れていない間は、直前の立ち上がりから length 以上 high が続いた後の立ち下がりだけを開始とする。
  let synced = !partial;
  let lastRise = Number.NEGATIVE_INFINITY;
  for (const edge of edges) {
    if (edge.v === 1) {
      lastRise = edge.t;
      continue;
    }
    if (edge.t < free) continue;
    if (!synced) {
      if (edge.t - lastRise < length - slack) continue;
      synced = true;
    }
    const start = edge.t;
    const level = (n: number): number => wave.levelAt(start + (n + 0.5) * bit);
    if (level(0) !== 0 || start + length > window.t1 + slack) continue;
    let value = 0;
    let ones = 0;
    for (let index = 0; index < spec.dataBits; index += 1) {
      const one = level(1 + index);
      value |= one << index;
      ones += one;
    }
    const parityOk = parityBits === 0 || (ones + level(1 + spec.dataBits)) % 2 === (spec.parity === 'E' ? 0 : 1);
    const stopOk = Array.from({ length: spec.stopBits }, (_, index) => level(1 + spec.dataBits + parityBits + index)).every((one) => one === 1);
    const error = !stopOk ? 'framing' : !parityOk ? 'parity' : null;
    frames.push({ t0: start, t1: start + length, value, text: error === null ? frameText(value, spec) : `${frameText(value, spec)}!`, error });
    free = start + length - slack;
  }
  return { frames, partial };
}
