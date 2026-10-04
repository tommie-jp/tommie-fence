import { element, num } from 'fence-kit';
import { darken } from './finish.ts';
import type { Layout } from '../model/layout.ts';
import type { Address, PlacedPart } from '../types.ts';
import { bodyRect } from '../placement/geometry.ts';
import type { Theme } from './theme.ts';

/**
 * 半田付けした穴。**ピンや配線が入った穴は、半田で埋まって銀の玉になる。**
 *
 * 何も入っていない穴は黒く抜けたまま残るので、**どこを半田付けするのかが
 * 図だけで分かる** — 空いた穴と埋めた穴が同じ形だと、組む人は図とにらめっこして
 * 部品のピンを数え直すことになる。
 *
 * ランドより一回り大きく描く。実物の半田は銅箔からわずかに盛り上がって穴を覆う。
 */

/** ランドの外径からどれだけ広げるか (半径)。盛り上がったぶん。 */
const GROW = 1.5;

/**
 * 半田の玉 1 つ。**部品の上に半田を描きたいところ**からも呼ぶ (端面実装の凹の
 * 先端 — ピンの印の上に半田が乗る)。ここと `renderJoints` で同じ形にしておかないと、
 * 同じ穴の半田が場所によって違う大きさに見える。
 */
export const jointMark = (x: number, y: number, theme: Theme): string =>
  element('circle', {
    cx: num(x), cy: num(y), r: num(theme.metrics.landSize / 2 + GROW),
    fill: theme.palette.land, stroke: darken(theme.palette.land, 0.25), 'stroke-width': 1,
  });

export function renderJoints(holes: readonly Address[], layout: Layout, theme: Theme): string {
  // 同じ穴にピンと配線が来ることは普通にあるので、番地で 1 つに畳む。
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

/** 胴に覆われた半田の穴を重ねるときの不透明度。 */
const COVERED_OPACITY = 0.5;

/**
 * **部品面の図でも半田付けした穴を見せる**ために、部品と配線の上へもう一度重ねる —
 * ピンの線や配線の端に隠れて、部品面からはどこを半田付けするのか読めなかった。
 * 胴の下の穴 (変換基板・USB-C の基板・電解コンデンサなど) は半分透かして重ねる。
 */
export function jointsOnTop(holes: readonly Address[], parts: readonly PlacedPart[], layout: Layout, theme: Theme): string {
  const bodies = parts.flatMap((part) => {
    const body = bodyRect(part, layout);
    return body === null ? [] : [body];
  });
  const exposed = exposedHoles(holes, bodies, layout);
  const open = new Set(exposed.map((hole) => `${hole.row},${hole.col}`));
  const covered = holes.filter((hole) => !open.has(`${hole.row},${hole.col}`));
  const faint = covered.length === 0 ? '' : element('g', { opacity: COVERED_OPACITY }, renderJoints(covered, layout, theme));
  return faint + renderJoints(exposed, layout, theme);
}

/** 胴に覆われていない半田の穴だけ。 */
export function exposedHoles(
  holes: readonly Address[],
  bodies: readonly { readonly cx: number; readonly cy: number; readonly width: number; readonly height: number; readonly angle: number }[],
  layout: Layout,
): Address[] {
  return holes.filter((hole) => {
    const { x, y } = layout.point(hole);
    return !bodies.some((body) => {
      const dx = x - body.cx;
      const dy = y - body.cy;
      const along = dx * Math.cos(body.angle) + dy * Math.sin(body.angle);
      const across = -dx * Math.sin(body.angle) + dy * Math.cos(body.angle);
      return Math.abs(along) < body.width / 2 && Math.abs(across) < body.height / 2;
    });
  });
}
