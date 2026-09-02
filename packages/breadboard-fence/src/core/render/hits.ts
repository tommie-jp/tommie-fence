import { formatAddress } from '../model/address.ts';
import type { Layout } from '../model/layout.ts';
import { HOLE_ROWS } from '../types.ts';
import type { Address, Board } from '../types.ts';
import { element, num } from './svg.ts';

/**
 * 掴むための**透明な層**。図の上に重ねて、穴と節点に当たり判定を付ける。
 *
 * **図そのものを掴ませる。** circuit は TeX が描いた SVG に構造が残らないので
 * 別の升目 (似顔絵) を組んでいるが、こちらは自分で SVG を組んでいて、
 * 穴の座標が `layout` から線形に出る。だから重ねるだけでよい (52 の docs/13)。
 *
 * **既定では出さない。** 出すのは編集のときだけで、貼る図は 1 バイトも変わらない。
 *
 * 層を 2 つに分けるのは circuit と同じ理由 — 部品の升にも節点は立つので、
 * どちらも掴めると掴んだつもりと違うものが動く。webview は道具に合う層だけを
 * 効かせる (`.cf-hits` が置き先、`.cf-marks` が掴む節点)。
 */

/** 穴 1 つぶんの当たり判定の大きさ (ピッチに対する割合)。隣とぶつからない範囲で大きく。 */
const CELL = 0.9;

/** 節点の掴みしろ。穴より少し大きく取る (指でも掴めるように)。 */
const DOT = 0.5;

const cellAt = (layout: Layout, address: Address): string => {
  const { x, y } = layout.point(address);
  const size = layout.pitch * CELL;
  return element('rect', {
    class: 'cf-cell',
    'data-address': formatAddress(address),
    x: num(x - size / 2),
    y: num(y - size / 2),
    width: num(size),
    height: num(size),
    fill: 'transparent',
  });
};

/** その板にある番地を、上のレールから下のレールまで順に。 */
function addressesOf(board: Board): readonly Address[] {
  const rails = board.rails ?? [];
  const columns = Array.from({ length: board.columns }, (_, index) => index + 1);

  return [
    ...rails.flatMap((row) => columns.map((col): Address => ({
      kind: 'rail',
      polarity: row[0] as '+' | '-',
      side: row[1] as 't' | 'b',
      col,
    }))),
    ...HOLE_ROWS.flatMap((row) => columns.map((col): Address => ({ kind: 'hole', row, col }))),
  ];
}

/**
 * 掴むための層。`used` は何かが書かれている穴 (節点の点を出す先)、
 * `names` は `points:` が付けた名前 (番地 → 名前)。
 */
export function renderHits(
  board: Board,
  layout: Layout,
  used: ReadonlySet<string>,
  names: ReadonlyMap<string, string>,
): string {
  const addresses = addressesOf(board);
  const cells = addresses.map((address) => cellAt(layout, address));

  const dots = addresses
    .filter((address) => used.has(formatAddress(address)))
    .map((address) => {
      const written = formatAddress(address);
      const { x, y } = layout.point(address);
      const name = names.get(written);
      return element('circle', {
        class: 'cf-dot',
        'data-node': written,
        ...(name === undefined ? {} : { 'data-name': name }),
        cx: num(x),
        cy: num(y),
        r: num(layout.pitch * DOT),
        fill: 'transparent',
      });
    });

  return [
    element('g', { class: 'cf-hits' }, cells.join('')),
    element('g', { class: 'cf-marks' }, dots.join('')),
  ].join('\n');
}
