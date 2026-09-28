import { fenceError, notice } from '../errors.ts';
import { TRACE_NAMES } from '../model/channel.ts';
import type { TraceName } from '../model/channel.ts';
import type { FenceError, XySpec } from '../types.ts';
import { wordsOf } from './result.ts';

/**
 * `view: xy` と `xy: ch1 math` (52 の docs/99 決め 3)。**軸は既定で横 ch1・縦 ch2**、
 * math も軸にできる。XY には時間軸が無いので `time:` `trigger:` `cursors:` `measure:` は断る
 * (書いたのに黙って捨てると、書き手は効いていると思う)。
 */

/** XY では書けないキー。data: は実測の XY を重ねられるようになるまで (段 3a では断る)。 */
export const XY_REFUSED = ['time', 'trigger', 'cursors', 'measure', 'data', 'notes'] as const;

/** 断る理由 (キーごと)。 */
const NO_TIME_AXIS = 'XY には時間軸がありません。読み値は各軸の Vpp・Vmax・Vmin です';
const XY_REASON: Readonly<Record<(typeof XY_REFUSED)[number], string>> = {
  time: NO_TIME_AXIS,
  trigger: NO_TIME_AXIS,
  cursors: NO_TIME_AXIS,
  measure: NO_TIME_AXIS,
  data: '実測の XY はまだ重ねられません',
  notes: '注釈の番地は「時刻 電圧」なので時間の画面 (view: time) にだけ置けます',
};

const XY_HINT = `xy: は横と縦を 2 つ書きます (例: xy: ch1 ch2。書けるのは ${TRACE_NAMES.join(' / ')})`;

export type XyContext = {
  readonly view: 'time' | 'xy';
  /** `xy:` の字と行 (書かなければ null)。 */
  readonly text: string | null;
  readonly line: number | null;
  /** `view:` の行 (既定のお知らせを置く)。 */
  readonly viewLine: number | null;
  /** 書いてあった一番外側のキーと、その行。 */
  readonly keyLines: ReadonlyMap<string, number | null>;
  /** 読めた線 (ch と math)。 */
  readonly read: readonly TraceName[];
};

const isTraceName = (text: string): text is TraceName => (TRACE_NAMES as readonly string[]).includes(text);

/** 軸 1 つが描けるか。書かれていない・読めなければ言う (xy: を書かなければ view: の行に)。 */
function axisError(name: TraceName, context: XyContext): FenceError | null {
  if (context.read.includes(name)) return null;
  const line = context.text === null ? context.viewLine : context.line;
  return context.keyLines.has(name)
    ? fenceError(`xy: の ${name} が読めないので XY を描けません`, line, context.text === null ? undefined : name)
    : fenceError(`xy: の ${name} が書かれていません`, line, context.text === null ? undefined : name);
}

/** 横と縦が描けるか見て組にする。 */
function pairOf(x: TraceName, y: TraceName, context: XyContext): { readonly xy: XySpec | null; readonly errors: readonly FenceError[] } {
  const errors = [axisError(x, context), axisError(y, context)].filter((error): error is FenceError => error !== null);
  return { xy: errors.length === 0 ? { x, y, line: context.line } : null, errors };
}

function axesOf(context: XyContext): { readonly xy: XySpec | null; readonly errors: readonly FenceError[] } {
  if (context.text === null) {
    const axes = pairOf('ch1', 'ch2', context);
    return axes.xy === null ? axes : { xy: axes.xy, errors: [notice('xy: が無いので 横 CH1・縦 CH2 で描いています', context.viewLine)] };
  }
  const words = wordsOf(context.text);
  const [x = '', y = ''] = words;
  if (words.length !== 2 || !isTraceName(x) || !isTraceName(y)) return { xy: null, errors: [fenceError(XY_HINT, context.line)] };
  if (x === y) return { xy: null, errors: [fenceError('xy: の横と縦は別の ch にします', context.line, y)] };
  return pairOf(x, y, context);
}

/** view: と xy: の組を見る。XY で書けないキーは行ごとに言う。 */
export function readXy(context: XyContext): { readonly xy: XySpec | null; readonly errors: readonly FenceError[] } {
  if (context.view === 'time') {
    return { xy: null, errors: context.text === null ? [] : [fenceError('xy: は view: xy のときだけ書けます', context.line, 'xy')] };
  }
  const refused = XY_REFUSED.filter((key) => context.keyLines.has(key)).map((key) => fenceError(
    `view: xy では ${key}: は書けません (${XY_REASON[key]})`,
    context.keyLines.get(key) ?? null, key,
  ));
  const axes = axesOf(context);
  return { xy: axes.xy, errors: [...refused, ...axes.errors] };
}
