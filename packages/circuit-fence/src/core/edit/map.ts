import { extractCircuitFences } from '../fences.ts';
import type { FenceBlock } from '../fences.ts';
import { LIMITS } from '../limits.ts';
import { cornerOf } from '../model/address.ts';
import type { Address } from '../model/address.ts';
import { normalizeNewlines } from '../newlines.ts';
import { parseFence } from '../parser/parseFence.ts';
import { cellOf } from '../types.ts';
import type { Circuit } from '../model/circuit.ts';
import type { Endpoint } from '../types.ts';
import { nodesOf } from './point.ts';
import { addressesOf } from './shared.ts';

/**
 * 部品を掴むための**グリッドマップ**。パース済みモデルから即時に描ける
 * 升目で、図 (TeX → SVG) とは別物。
 *
 * **図そのものを掴ませない。** tikzjax の SVG は意味構造が残らず、外形も
 * ラベル込みで TeX 任せなので、クリック位置 → 番地の写像が立たない。
 * マップなら位置合わせの問題がそもそも存在せず、操作に即時で追従できる
 * (図は数秒後に描き直る)。
 */

/** 升目の上の 1 点。**番地と同じ形**だが、こちらは描くための座標。 */
export type Cell = { readonly row: number; readonly col: number };

/** マップに置く部品 1 つ。 */
export type Chip = {
  readonly id: string;
  readonly type: string;
  readonly row: number;
  readonly col: number;
  /** 2 端子部品のもう一方の端。1 端子・多端子は null。 */
  readonly to: Cell | null;
};

/**
 * マップに引く線 1 本。折れた配線は角で 2 本に割ってある
 * (描く側が向きを気にしなくて済む)。
 */
export type WireLine = {
  readonly from: Cell;
  readonly to: Cell;
  /**
   * ピンの端を部品の升で近似したか。**正しい足の位置は TeX しか知らない**
   * (記号の形から決まる)。描く側はここを見て破線にする。
   */
  readonly approximate: boolean;
};

/** マップに置く節点 1 つ。**掴む物が部品とは違う**ので、チップとは別に持つ。 */
export type Dot = {
  readonly row: number;
  readonly col: number;
  /** `points:` が付けた名前。無ければ null。 */
  readonly name: string | null;
  /** その番地を書いている場所の数。 */
  readonly uses: number;
};

export type GridMap = {
  readonly rows: number;
  readonly cols: number;
  readonly chips: readonly Chip[];
  /** 掴める節点。交点の間にあるものは載らない (チップと同じ理由)。 */
  readonly dots: readonly Dot[];
  /** 引く線。部品の形と違い、**書かれたとおりの位置**に引ける。 */
  readonly wires: readonly WireLine[];
  /** 升目に載らないので出さなかった部品 (交点の間に置かれたもの)。 */
  readonly skipped: readonly string[];
  /** フェンスを読めたか。読めなければマップは空。 */
  readonly readable: boolean;
};

/** 動かせる余地。部品が端に寄っていても、その先へ運べる升を出しておく。 */
const MARGIN = 2;
const MIN_ROWS = 4;
const MIN_COLS = 6;

const isOnCrossing = (address: Address): boolean =>
  Number.isInteger(address.row) && Number.isInteger(address.col);

const cellAt = (address: Address): Cell => ({ row: address.row, col: address.col });

/**
 * 引く線。折れは角で 2 本に割る。
 *
 * **ピンの端は部品の升で近似する。** 足の正しい位置は記号の形から決まるので
 * TeX しか知らない (docs/03 に書いた既知の限界と同じ根)。描かないと配線が
 * 消えて見えるので、「だいたいここ」として引いて破線で断る。
 * 指す先の部品が無い配線は引かない — 書き間違いはエラーの帯の仕事で、
 * ここで当てずっぽうの線を足すと誤りが図らしく見えてしまう。
 */
function wireLinesOf(doc: Circuit): WireLine[] {
  const anchorAt = new Map<string, Address>();
  for (const part of doc.parts) {
    const anchor = addressesOf(part)[0];
    if (anchor !== undefined) anchorAt.set(part.id, anchor);
  }

  const resolve = (endpoint: Endpoint): { cell: Address; approximate: boolean } | null => {
    const written = cellOf(endpoint);
    if (written !== null) return { cell: written, approximate: false };
    const anchor = endpoint.kind === 'pin' ? anchorAt.get(endpoint.part) : undefined;
    return anchor === undefined ? null : { cell: anchor, approximate: true };
  };

  const lines: WireLine[] = [];
  for (const wire of doc.wires) {
    const from = resolve(wire.from);
    const to = resolve(wire.to);
    if (from === null || to === null) continue;

    const approximate = from.approximate || to.approximate;
    const corner = cornerOf(from.cell, to.cell, wire.operator);
    if (corner === null) {
      lines.push({ from: cellAt(from.cell), to: cellAt(to.cell), approximate });
      continue;
    }
    lines.push({ from: cellAt(from.cell), to: cellAt(corner), approximate });
    lines.push({ from: cellAt(corner), to: cellAt(to.cell), approximate });
  }
  return lines;
}

/** フェンス本文から升目のモデルを作る。**読めなければ空**で、嘘の位置を見せない。 */
export function gridMap(source: string): GridMap {
  const { doc } = parseFence(normalizeNewlines(source));
  if (!doc) {
    return { rows: MIN_ROWS, cols: MIN_COLS, chips: [], dots: [], wires: [], skipped: [], readable: false };
  }

  const chips: Chip[] = [];
  const skipped: string[] = [];

  for (const part of doc.parts) {
    const addresses = addressesOf(part);
    // **交点の間 (`a_1.5`) は升目に載らない。** 別の升へ寄せて見せると、
    // 掴んで動かしたとき書いた場所と違うところへ行く。
    if (!addresses.every(isOnCrossing)) {
      skipped.push(part.id);
      continue;
    }
    const [anchor, far] = addresses;
    chips.push({
      id: part.id,
      type: part.type,
      row: (anchor as Address).row,
      col: (anchor as Address).col,
      to: far ? { row: far.row, col: far.col } : null,
    });
  }

  const dots: Dot[] = nodesOf(doc)
    .filter((node) => isOnCrossing(node.address))
    .map((node) => ({ row: node.address.row, col: node.address.col, name: node.name, uses: node.uses }));

  const wires = wireLinesOf(doc);

  // **升目は点と線も覆う。** 配線だけが届く交点はチップに現れないので、
  // 部品だけを見て決めると端が升の外へ落ちて掴めなくなる。
  // 端数の番地は切り上げて数える (`a_1.5` は 2 列目まで要る)。
  const used: readonly Cell[] = [
    ...chips.flatMap((chip) => [chip, chip.to].filter((cell) => cell !== null)),
    ...dots,
    ...wires.flatMap((wire) => [wire.from, wire.to]),
  ];
  const span = (of: (cell: Cell) => number): number[] => used.map((cell) => Math.ceil(of(cell)) + 1 + MARGIN);
  const rows = Math.min(26, Math.max(MIN_ROWS, ...span((cell) => cell.row)));
  const cols = Math.min(LIMITS.columns, Math.max(MIN_COLS, ...span((cell) => cell.col)));

  return { rows, cols, chips, dots, wires, skipped, readable: true };
}

/** カーソルのある行 (1 始まり) を含む circuit フェンス。無ければ null。 */
export function fenceAt(markdown: string, line: number): FenceBlock | null {
  for (const fence of extractCircuitFences(markdown)) {
    const bodyLines = fence.source === '' ? 0 : fence.source.replace(/\n$/, '').split('\n').length;
    // 開き記号の行から閉じ記号の行までを「中」とみなす (カーソルが縁にあっても拾う)。
    if (line >= fence.line && line <= fence.line + bodyLines + 1) return fence;
  }
  return null;
}
