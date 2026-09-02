import { element, num } from 'fence-kit';
import { formatAddress } from '../model/address.ts';
import type { Layout } from '../model/layout.ts';
import type { Address, Board } from '../types.ts';

/**
 * 掴むための**透明な層**。図の上に重ねて、穴と節点に当たり判定を付ける。
 *
 * **図そのものを掴ませる。** circuit は TeX が描いた SVG に構造が残らないので
 * 別の升目 (似顔絵) を組んでいるが、こちらは自分で SVG を組んでいて、
 * 穴の座標が `layout` から線形に出る。だから重ねるだけでよい (52 の docs/13)。
 * breadboard と同じ形 — **格子が一様なぶん、こちらのほうが素直**
 * (溝もレールも無いので、番地は行と列の 2 つの数だけで決まる)。
 *
 * **既定では出さない。** 出すのは編集のときだけで、貼る図は 1 バイトも変わらない。
 */

/** 穴 1 つぶんの当たり判定の大きさ (ピッチに対する割合)。隣とぶつからない範囲で大きく。 */
const CELL = 0.9;

/** 節点の掴みしろ。穴より少し大きく取る (指でも掴めるように)。 */
const DOT = 0.5;

/**
 * 掴むための層。`used` は何かが書かれている穴 (節点の点を出す先)、
 * `names` は `points:` が付けた名前 (番地 → 名前)。
 *
 * 升は**板の穴だけ**に置く。板の外の番地 (`a0` や `-a-1`) は穴が無く、
 * 置いても掴む先にならない (配線の行き先としては書けるが、それは字で書く話)。
 */
export function renderHits(
  board: Board,
  layout: Layout,
  used: ReadonlySet<string>,
  names: ReadonlyMap<string, string>,
): string {
  const addresses: Address[] = [];
  for (let row = 1; row <= board.rows; row += 1) {
    for (let col = 1; col <= board.cols; col += 1) addresses.push({ row, col });
  }

  const size = layout.pitch * CELL;
  const cells = addresses.map((address) => {
    const { x, y } = layout.point(address);
    return element('rect', {
      class: 'cf-cell',
      'data-address': formatAddress(address),
      x: num(x - size / 2),
      y: num(y - size / 2),
      width: num(size),
      height: num(size),
      fill: 'transparent',
    });
  });

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

  // 掴む層と置き先の層を分けるのは circuit / breadboard と同じ理由 —
  // 部品の升にも節点は立つので、どちらも掴めると掴んだつもりと違うものが動く。
  return [
    element('g', { class: 'cf-hits' }, cells.join('')),
    element('g', { class: 'cf-marks' }, dots.join('')),
  ].join('');
}
