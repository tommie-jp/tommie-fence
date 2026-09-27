/**
 * 画面の点の列。**理想も実測も同じ形** — マーカーはこの列から読む (道を 1 つにする)。
 * `level` は表示の単位 (dBV か dBm)。`at` は読み値に出す周波数: 掃引型で線がその点の
 * 受け持つ幅に落ちたときは線の周波数、ほかは点の周波数。
 */
export type Point = { readonly f: number; readonly level: number; readonly at: number };

export type Trace = { readonly points: readonly Point[]; readonly basis: 'model' | 'data' };
