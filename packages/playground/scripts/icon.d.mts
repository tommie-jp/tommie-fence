/**
 * `icon.mjs` の型。**中身は素の JS** — 組み立て (esbuild.mjs) が Node から
 * そのまま読むので、変換の要らない形で置いてある。試験は型を要るので、
 * 出入口だけここで名乗る。
 */

/** その大きさの絵札 1 枚 (RGBA を並べたもの)。 */
export function drawIcon(size: number): Uint8Array;

/** RGBA を PNG に詰める。 */
export function encodePng(size: number, rgba: Uint8Array): Buffer;

/** その大きさの絵札 1 枚 (PNG)。 */
export function iconPng(size: number): Buffer;
