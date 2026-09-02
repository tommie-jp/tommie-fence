import { element, num } from 'fence-kit';
import { darken } from './finish.ts';
import type { Layout } from '../model/layout.ts';
import type { Address } from '../types.ts';
import type { Theme } from './theme.ts';

/**
 * 半田付けした穴。**足や配線が入った穴は、半田で埋まって銀の玉になる。**
 *
 * 何も入っていない穴は黒く抜けたまま残るので、**どこを半田付けするのかが
 * 図だけで分かる** — 空いた穴と埋めた穴が同じ形だと、組む人は図とにらめっこして
 * 部品の足を数え直すことになる。
 *
 * ランドより一回り大きく描く。実物の半田は銅箔からわずかに盛り上がって穴を覆う。
 */

/** ランドの外径からどれだけ広げるか (半径)。盛り上がったぶん。 */
const GROW = 1.5;

/**
 * 半田の玉 1 つ。**部品の上に半田を描きたいところ**からも呼ぶ (端面実装の凹の
 * 先端 — 足の印の上に半田が乗る)。ここと `renderJoints` で同じ形にしておかないと、
 * 同じ穴の半田が場所によって違う大きさに見える。
 */
export const jointMark = (x: number, y: number, theme: Theme): string =>
  element('circle', {
    cx: num(x), cy: num(y), r: num(theme.metrics.landSize / 2 + GROW),
    fill: theme.palette.land, stroke: darken(theme.palette.land, 0.25), 'stroke-width': 1,
  });

export function renderJoints(holes: readonly Address[], layout: Layout, theme: Theme): string {
  // 同じ穴に足と配線が来ることは普通にあるので、番地で 1 つに畳む。
  // 重ねて描くと縁が濃くなり、その穴だけ違う部品のように見える。
  const seen = new Set<string>();
  const drawn: string[] = [];

  for (const hole of holes) {
    const key = `${hole.row},${hole.col}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const { x, y } = layout.point(hole);
    drawn.push(jointMark(x, y, theme));
  }

  return drawn.join('');
}
