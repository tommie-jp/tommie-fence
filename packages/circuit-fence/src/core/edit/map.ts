import { escapeMarkup } from 'fence-kit';
import { extractCircuitFences } from '../fences.ts';
import type { FenceBlock } from '../fences.ts';
import { LIMITS } from '../limits.ts';
import { formatAddress } from '../model/address.ts';
import type { Address } from '../model/address.ts';
import { normalizeNewlines } from '../newlines.ts';
import { parseFence } from '../parser/parseFence.ts';
import type { PartSpec } from '../types.ts';

/**
 * 部品を掴むための**グリッドマップ**。パース済みモデルから即時に描ける
 * 升目で、図 (TeX → SVG) とは別物。
 *
 * **図そのものを掴ませない。** tikzjax の SVG は意味構造が残らず、外形も
 * ラベル込みで TeX 任せなので、クリック位置 → 番地の写像が立たない。
 * マップなら位置合わせの問題がそもそも存在せず、操作に即時で追従できる
 * (図は数秒後に描き直る)。
 */

/** マップに置く部品 1 つ。 */
export type Chip = {
  readonly id: string;
  readonly type: string;
  readonly row: number;
  readonly col: number;
  /** 2 端子部品のもう一方の端。1 端子・多端子は null。 */
  readonly to: { readonly row: number; readonly col: number } | null;
};

export type GridMap = {
  readonly rows: number;
  readonly cols: number;
  readonly chips: readonly Chip[];
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

const addressesOf = (part: PartSpec): readonly Address[] =>
  part.kind === 'two-terminal' ? [part.from, part.to] : [part.at];

/** フェンス本文から升目のモデルを作る。**読めなければ空**で、嘘の位置を見せない。 */
export function gridMap(source: string): GridMap {
  const { doc } = parseFence(normalizeNewlines(source));
  if (!doc) return { rows: MIN_ROWS, cols: MIN_COLS, chips: [], skipped: [], readable: false };

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

  const used = chips.flatMap((chip) => [chip, chip.to].filter((cell) => cell !== null));
  const rows = Math.min(26, Math.max(MIN_ROWS, ...used.map((cell) => cell.row + 1 + MARGIN)));
  const cols = Math.min(LIMITS.columns, Math.max(MIN_COLS, ...used.map((cell) => cell.col + 1 + MARGIN)));

  return { rows, cols, chips, skipped, readable: true };
}

const cellAddress = (row: number, col: number): string => formatAddress({ row, col });

/**
 * 升目の HTML。**webview に渡す本体**で、ここも純関数
 * (vscode を知らないので、そのままユニットテストに掛かる)。
 *
 * フェンスから来た字は必ずエスケープする。webview は拡張が渡した HTML を
 * サニタイズしない (プレビューと同じ約束)。
 */
export function renderMapHtml(map: GridMap): string {
  if (!map.readable) {
    return '<p class="cf-note">フェンスを読めません。エラーを直すとマップが出ます。</p>';
  }

  // **同じ交点に 2 つ来たら両方出す。** この文法では同じ番地 = 接続なので
  // 普通に起きる。片方を隠すと、掴んで出すこともできなくなる。
  const chipsAt = new Map<string, Chip[]>();
  for (const chip of map.chips) {
    const key = `${chip.row},${chip.col}`;
    chipsAt.set(key, [...(chipsAt.get(key) ?? []), chip]);
  }
  const farEnd = new Set(map.chips.filter((chip) => chip.to).map((chip) => `${chip.to?.row},${chip.to?.col}`));

  const rows: string[] = [];
  for (let row = 0; row < map.rows; row += 1) {
    const cells: string[] = [];
    for (let col = 0; col < map.cols; col += 1) {
      const address = cellAddress(row, col);
      const here = chipsAt.get(`${row},${col}`) ?? [];
      const far = farEnd.has(`${row},${col}`) ? ' cf-far' : '';
      const inner = here
        .map((chip) => `<button class="cf-chip" data-part="${escapeMarkup(chip.id)}"`
          + ` title="${escapeMarkup(`${chip.id} (${chip.type}) ${address}`)}">${escapeMarkup(chip.id)}</button>`)
        .join('');
      cells.push(
        `<td class="cf-cell${far}" data-address="${escapeMarkup(address)}"`
        + ` title="${escapeMarkup(address)}">${inner}</td>`,
      );
    }
    rows.push(`<tr><th class="cf-row">${escapeMarkup(cellAddress(row, 0).slice(0, 1))}</th>${cells.join('')}</tr>`);
  }

  const heads = Array.from({ length: map.cols }, (_, col) => `<th class="cf-col">${col + 1}</th>`).join('');
  const skipped = map.skipped.length === 0
    ? ''
    : `<p class="cf-note">交点の間に置いた部品はマップに出ません: ${escapeMarkup(map.skipped.join(', '))}</p>`;

  return `<table class="cf-map"><thead><tr><th></th>${heads}</tr></thead>`
    + `<tbody>${rows.join('')}</tbody></table>${skipped}`;
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
