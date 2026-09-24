import type { THEME_NAMES } from './limits.ts';

/**
 * copper フェンスの型。**perfboard と分けてある理由は物理**で、
 * 銅張り基板には穴の格子が無い。位置は mm で、導通は銅の形そのもの
 * (触れ合う形は 1 つのネット)。52 の docs/73・74 に決めと理由がある。
 */

export type FenceError = {
  readonly message: string;
  readonly line: number | null;
  /** 読めなかった綴り。行の中で 1 か所に決まるときだけ、報告に印が付く。 */
  readonly token?: string;
  /** その行の中身。`attachSourceText` が添える。 */
  readonly text?: string;
  /** 行の中で指す範囲 (0 始まりの桁と、コードポイントで数えた長さ)。 */
  readonly at?: { readonly column: number; readonly length: number };
  /** お知らせ (読めているが思ったとおりに出ない)。 */
  readonly notice?: boolean;
};

/** フェンスの一番外側に書けるキー。知らないキーを名指すのにも使う。 */
export const TOP_LEVEL_KEYS = ['board', 'f', 'title', 'copper', 'parts', 'wires', 'notes', 'style'] as const;

export type TopLevelKey = (typeof TOP_LEVEL_KEYS)[number];

/** mm の点。**原点は板の左上**、x は右、y は下 (perfboard の `a1` と同じ向き)。 */
export type Mm = { readonly x: number; readonly y: number };

/** mm の矩形 (左上と大きさ)。 */
export type RectMm = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };

/** 画布の点と矩形 (px)。 */
export type Point = { readonly x: number; readonly y: number };
export type Rect = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };

/** 板の辺。端面 SMA を載せる所。 */
export type Side = 'left' | 'right' | 'top' | 'bottom';

/**
 * 地 (GND) の在りか。
 *
 * - `back` — 両面板で**裏がベタ**。表は線路だけ残して剥がす (マイクロストリップ)
 * - `front` — **表が地**。線路と島を溝で切り出す (CPW。裏は使わない)
 * - `both` — 表も裏も地 (CPWG・Manhattan を両面板で)
 * - `none` — 地が無い (片面板を剥がしただけ)
 */
export type Ground = 'back' | 'front' | 'both' | 'none';

/** 板。**実寸と基材**で、Z0 の式の入力になる。 */
export type Board = {
  /** 幅と高さ (mm)。 */
  readonly width: number;
  readonly height: number;
  /** 基材の厚さ (mm)。 */
  readonly h: number;
  /** 比誘電率。 */
  readonly er: number;
  readonly ground: Ground;
  /** 表が地の板で、島のまわりに切る溝の幅 (mm)。線路ごとに `gap` で変えられる。 */
  readonly cut: number;
};

/** 向き。**時計回り**に回してから、`mirror` なら左右を裏返す (perfboard と同じ語彙)。 */
export type Turn = 0 | 90 | 180 | 270;
export type Orient = { readonly turn: Turn; readonly mirror: boolean };

// ---- 銅の形 (`copper:`) ----

/** 線路。**縦横の区間の折れ線**と幅。 */
export type LineSpec = {
  readonly kind: 'line';
  readonly id: string;
  readonly points: readonly Mm[];
  readonly width: number;
  /** 表が地の板で両脇に切る溝 (mm)。null は板の `cut`。 */
  readonly gap: number | null;
  readonly line: number | null;
};

/** 島 (矩形の銅)。中心と大きさ。Manhattan の足場・パッチ・地の島。 */
export type PadSpec = {
  readonly kind: 'pad';
  readonly id: string;
  readonly at: Mm;
  readonly width: number;
  readonly height: number;
  readonly line: number | null;
};

/** 裏の地へ落とす穴 (実物は穴に線を通して両面を半田付けする)。 */
export type ViaSpec = {
  readonly kind: 'via';
  readonly id: string;
  readonly at: Mm;
  /** 穴の径 (mm)。 */
  readonly drill: number;
  readonly line: number | null;
};

/** 地の切り欠き (スロットアンテナ・地の分断)。**銅ではない**。 */
export type SlotSpec = {
  readonly kind: 'slot';
  readonly id: string;
  readonly at: Mm;
  readonly width: number;
  readonly height: number;
  readonly line: number | null;
};

export type CopperSpec = LineSpec | PadSpec | ViaSpec | SlotSpec;

// ---- 部品 (`parts:`) ----

type PartCommon = {
  readonly id: string;
  readonly type: string;
  readonly variant: string | null;
  readonly value: string | null;
  readonly line: number | null;
};

/** 端面 SMA。辺と、辺に沿った位置 (mm)。 */
export type EdgePartSpec = PartCommon & {
  readonly kind: 'edge';
  readonly side: Side;
  readonly offset: number;
};

/** 2 本足の面実装 (チップ・SOD)。中心の点。**乗った線路を切る**。 */
export type ChipPartSpec = PartCommon & {
  readonly kind: 'chip';
  readonly at: Mm;
  /** 書いていなければ null (乗った線路の向き、無ければ横)。 */
  readonly orient: Orient | null;
};

/** 3 本足の面実装 (SOT)。中心の点。 */
export type SotPartSpec = PartCommon & {
  readonly kind: 'sot';
  readonly at: Mm;
  readonly orient: Orient | null;
};

/** 箱 (SAW・缶・モジュール)。中心と大きさと足の数。足は左右の辺に並ぶ。 */
export type BoxPartSpec = PartCommon & {
  readonly kind: 'box';
  readonly at: Mm;
  readonly width: number;
  readonly height: number;
  readonly pins: number;
  readonly orient: Orient | null;
};

/** 足のある部品。**端は島の名前か点**。 */
export type LeadedPartSpec = PartCommon & {
  readonly kind: 'leaded';
  readonly ends: readonly [string, string];
};

export type PartSpec = EdgePartSpec | ChipPartSpec | SotPartSpec | BoxPartSpec | LeadedPartSpec;

/** 島どうしのジャンパ。端は島の名前か点。 */
export type WireSpec = {
  readonly from: string;
  readonly to: string;
  readonly color: string | null;
  readonly line: number | null;
};

// ---- 注釈 (`notes:`) ----

export type NoteKind = 'mark' | 'box' | 'arrow' | 'text' | 'dim' | 'source' | 'parts';

export type NoteSpec = {
  readonly kind: NoteKind;
  readonly from: Mm | null;
  readonly to: Mm | null;
  readonly color: string | null;
  readonly text: string | null;
  readonly turn: Turn;
  readonly line: number | null;
};

// ---- 見た目 (`style:`) ----

export type ThemeName = (typeof THEME_NAMES)[number];

export type StyleSpec = {
  readonly theme: ThemeName | null;
  readonly width: number | null;
  readonly debug: boolean | null;
  readonly stamp: boolean | null;
  readonly check: boolean | null;
  /** 1mm の方眼を敷くか。 */
  readonly grid: boolean | null;
  /** 裏から見た図を下に出すか。 */
  readonly back: boolean | null;
};

export type FenceDocument = {
  readonly board: Board;
  /** 設計の周波数 (Hz)。書くと線路の電気長を出す。 */
  readonly f: number | null;
  readonly title: string | null;
  readonly copper: readonly CopperSpec[];
  readonly parts: readonly PartSpec[];
  readonly wires: readonly WireSpec[];
  readonly notes: readonly NoteSpec[];
  readonly style: StyleSpec;
};
