/**
 * fence-check — circuit / breadboard / perfboard の図の崩れを数える (52 の docs/148)。
 *
 * **自分では描かない。** 各フェンスの core が返す幾何 (`Scene`、fence-kit) を受け取り、
 * 部品どうしの重なり・線と部品の交差・線どうしの十字と 4 方向の交点・名札の衝突を
 * 1 件ずつ返す。DOM も Node も使わない (CLI だけが Node を使う)。
 */
export { DEFAULT_MIN, KINDS, checkScene } from './check.ts';
export type { CheckOptions, Finding, Kind } from './check.ts';
export { checkFence, titleOf } from './figures.ts';
export type { FenceInput, SceneMakers } from './figures.ts';
export { formatRow, formatSummary, formatTop, rowsOf, summarize, topFigures } from './report.ts';
export type { FigureResult, FindingRow, Summary } from './report.ts';
