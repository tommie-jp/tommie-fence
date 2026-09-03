import { element, num } from 'fence-kit';
import { formatAddress, parseAddress } from '../model/address.ts';
import type { Layout } from '../model/layout.ts';
import { slotEdges } from '../model/board.ts';
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
 * 升は**半田付けできる所**に置く — 穴と、`slots:` を書いた板の縁の銅箔。
 * 銅箔には穴が無いので部品は挿さらないが、**配線は半田付けなので付く**
 * (実物のスロットはそのために付いている)。掴めないと、書ける配線が
 * マップからだけ引けないことになる。
 *
 * それ以外の板の外 (`-a-1` など) には置かない。配線の行き先としては書けるが、
 * そこは字で書く話で、押す先が無い。
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
  // 縁の銅箔。**描いてある所と同じ番地** (`render/slots.ts` が穴 1 つぶん外に置く)。
  const edges = slotEdges(board);
  if (edges === 'sides') {
    for (let row = 1; row <= board.rows; row += 1) {
      addresses.push({ row, col: 0 }, { row, col: board.cols + 1 });
    }
  } else if (edges === 'ends') {
    for (let col = 1; col <= board.cols; col += 1) {
      addresses.push({ row: 0, col }, { row: board.rows + 1, col });
    }
  }

  // **板の外でも、何かが書かれている所には升を立てる。** 端面実装のコネクタは
  // 足が板の縁の外にあるのが正しい姿なので、そこを掴めないと節点を引きずれない。
  // 書かれていない板の外には立てない (押す先が無い)。
  const already = new Set(addresses.map((address) => formatAddress(address)));
  for (const written of used) {
    if (already.has(written)) continue;
    const address = parseAddress(written);
    if (address === null) continue;
    already.add(written);
    addresses.push(address);
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
