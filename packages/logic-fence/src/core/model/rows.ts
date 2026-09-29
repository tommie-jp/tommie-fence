import type { Frame } from './decode.ts';
import type { Radix } from './radix.ts';
import type { Level, Transition, Wave } from './wave.ts';

/**
 * 画面の行。**3 種類** — 1 ビットのレーン・バス・読み下し。図も読み値も、この行から作る。
 */
export type BitRow = {
  readonly kind: 'bit';
  readonly name: string;
  /** 書いた DIO の番号。 */
  readonly dio: number | null;
  readonly line: number | null;
  readonly levelAt: (t: number) => Level;
  /** 窓の外も含めて変わり目を引く口 (トリガの検査が窓の左端ちょうどの edge を拾う)。 */
  readonly edgesIn: Wave['edges'];
  /** 窓の左端の高低と、窓の中の変わり目。**密で数えなかったレーンは null。** */
  readonly initial: Level;
  readonly transitions: readonly Transition[] | null;
  /** 3 px より近い変わり目があり、線でなく塗りで描く。 */
  readonly dense: boolean;
  /** 隣り合う変わり目の一番短い間隔 (s)。変わり目が 2 つ無ければ null。 */
  readonly minGap: number | null;
};

export type BusSegment = { readonly t0: number; readonly t1: number; readonly value: number };

export type BusRow = {
  readonly kind: 'bus';
  readonly name: string;
  readonly line: number | null;
  readonly radix: Radix;
  /** MSB が先。 */
  readonly members: readonly string[];
  readonly width: number;
  readonly valueAt: (t: number) => number;
  /** 値の区間。**どれかのメンバーが密なら null** (塗りで描く)。 */
  readonly segments: readonly BusSegment[] | null;
  readonly dense: boolean;
  readonly minGap: number | null;
};

export type DecodeRow = {
  readonly kind: 'decode';
  readonly name: string;
  readonly line: number | null;
  readonly protocol: string;
  readonly frames: readonly Frame[];
  readonly frameAt: (t: number) => Frame | null;
};

export type Row = BitRow | BusRow | DecodeRow;
