/**
 * 回した足を**板の中へ寄せ直す**ための物差し。穴の綴りは知らない (行と列の数だけ)。
 *
 * **回転そのものを断らない。** 縁に置いた部品を回すと足が板の外へ出るが、
 * 使う人が言ったのは「回して」であって「回せるか訊いた」のではない。
 * 断ると「この部品は回らない」に見える — 実機で
 * 「抵抗は回転できるが、capacitor, inductor などほとんど回転できない」と
 * 言われたのがこれで、実は**部品の種類ではなく置いた行**で決まっていた
 * (足の間隔が広いほど、板の端で外へ出やすい)。
 *
 * だから**回してから、いちばん近い所へ平行移動して板に載せる**。
 * 動かす量は足りない分ちょうどなので、載っているものは 1 穴も動かない。
 */

/** 行と列の数 (綴りではない)。 */
export type Cell = { readonly row: number; readonly col: number };

/** 端を含む範囲。 */
export type Range = { readonly least: number; readonly most: number };

/** その向きに寄せる量。**入りきらなければ null** (回しても板に収まらない形)。 */
function shiftInto(landings: readonly number[], range: Range): number | null {
  const least = Math.min(...landings);
  const most = Math.max(...landings);
  if (most - least > range.most - range.least) return null;
  if (least < range.least) return range.least - least;
  if (most > range.most) return range.most - most;
  return 0;
}

/**
 * 板の中へ寄せる量 (行と列)。**すでに載っていれば 0**。
 * どちらかの向きに入りきらなければ null。
 */
export function slideInto(
  landings: readonly Cell[],
  rows: Range,
  cols: Range,
): Cell | null {
  if (landings.length === 0) return { row: 0, col: 0 };
  const row = shiftInto(landings.map((one) => one.row), rows);
  const col = shiftInto(landings.map((one) => one.col), cols);
  return row === null || col === null ? null : { row, col };
}

/** 寄せたあとの落ち先。`slideInto` が null を返したときは元のまま返す。 */
export function slideBy<T extends Cell>(landings: readonly T[], slide: Cell | null): readonly T[] {
  if (slide === null || (slide.row === 0 && slide.col === 0)) return landings;
  return landings.map((one) => ({ ...one, row: one.row + slide.row, col: one.col + slide.col }));
}
