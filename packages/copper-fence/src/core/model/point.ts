import type { Mm } from '../types.ts';

/**
 * mm の番地 `x,y`。**原点は板の左上**で、x は右、y は下。
 *
 * 整数部は 3 桁、小数は 2 桁 (0.01mm) まで。**格子が無い板に文字の番地を
 * 振らない** — 40mm の板で 40 字の行名になり、0.5mm が書けない (52 の docs/73)。
 * 桁に上限を置くのは perfboard の Phase 3 と同じ理由 (上限の無い数は無限になる)。
 */
const POINT = /^(-?\d{1,3}(?:\.\d{1,2})?),(-?\d{1,3}(?:\.\d{1,2})?)$/;

/** 点のつもりで書かれた綴りか (桁が多い・小数が長いのを言い分けるため)。 */
const POINT_LIKE = /^-?[\d.]+,-?[\d.]+$/;

/** 0.01mm に丸める。**触れ合いの判定が浮動小数で揺れない**ようにする。 */
export const round2 = (value: number): number => Math.round(value * 100) / 100;

export function parsePoint(text: string): Mm | null {
  const found = POINT.exec(text.trim());
  if (found === null) return null;
  return { x: round2(Number(found[1])), y: round2(Number(found[2])) };
}

/** 点らしいが読めない綴りに返す一言。点らしくなければ null。 */
export function pointProblem(text: string): string | null {
  if (!POINT_LIKE.test(text.trim())) return null;
  return `点として読めません: ${text} (x,y を mm で。小数は 2 桁まで、整数は 3 桁まで)`;
}

/** mm の値を綴る。**末尾の 0 を落とす** (`12.50` ではなく `12.5`)。書き戻しはこの綴り。 */
export const formatMm = (value: number): string => String(round2(value) + 0);

export const formatPoint = (point: Mm): string => `${formatMm(point.x)},${formatMm(point.y)}`;

/**
 * 長さ・大きさは **`mm` を付ける** (`3mm` `0.15mm` `4x4mm`)。素の数は読まない
 * (直下の CLAUDE.md の文法の方針 1)。以前は線路の幅は単位を受けず、パッドは
 * 付けても付けなくてもよく、`size:` だけ必須だった — 1 つのフェンスの中で揃える。
 *
 * **点 (`x,y`) と SMA の辺に沿った位置は番地**なので素の数のまま (板の上の位置は
 * いつも mm で、別の単位に読める余地が無い)。
 */
const LENGTH = /^(\d{1,3}(?:\.\d{1,3})?)mm$/;

/** 素の数 (`3` `0.8`)。単位を忘れた長さに、付け方を言うために見分ける。 */
const BARE_LENGTH = /^\d{1,3}(?:\.\d{1,3})?$/;

/** mm の長さ (`3mm` `0.15mm`)。負と 0 は読まない。 */
export function parseLength(text: string): number | null {
  const found = LENGTH.exec(text);
  if (found === null) return null;
  const value = Number(found[1]);
  return value > 0 ? value : null;
}

/** 長さを綴る (`3.06mm`)。書き戻しはこの綴り。 */
export const formatLength = (value: number): string => `${formatMm(value)}mm`;

/** 大きさ `4x4mm`。 */
const SIZE = /^(\d{1,3}(?:\.\d{1,2})?)[xX×](\d{1,3}(?:\.\d{1,2})?)mm$/;
const BARE_SIZE = /^\d{1,3}(?:\.\d{1,2})?[xX×]\d{1,3}(?:\.\d{1,2})?$/;

export function parseSize(text: string): { readonly width: number; readonly height: number } | null {
  const found = SIZE.exec(text);
  if (found === null) return null;
  const width = Number(found[1]);
  const height = Number(found[2]);
  return width > 0 && height > 0 ? { width, height } : null;
}

/** 大きさを綴る (`4x4mm`)。 */
export const formatSize = (width: number, height: number): string => `${formatMm(width)}x${formatMm(height)}mm`;

/** 単位を忘れた長さ・大きさなら、付け方 (`3mm を付けます`)。そうでなければ null。 */
export function unitProblem(text: string): string | null {
  return BARE_LENGTH.test(text) || BARE_SIZE.test(text) ? `単位 mm を付けます (${text}mm)` : null;
}

export const distance = (a: Mm, b: Mm): number => Math.hypot(b.x - a.x, b.y - a.y);
