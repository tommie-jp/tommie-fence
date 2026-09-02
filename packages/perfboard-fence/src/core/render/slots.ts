import { element, num } from 'fence-kit';
import { slotEdges } from '../model/board.ts';
import { PITCH } from '../model/layout.ts';
import type { Layout } from '../model/layout.ts';
import type { Board } from '../types.ts';
import type { Theme } from './theme.ts';

/**
 * スロット用の銅箔。**板の短いほうの両端**に、細長いランドを並べる。
 *
 * 実物のユニバーサル基板には、短辺に沿って細長い銅箔が並んでいるものがある
 * (カードエッジのスロットに挿したり、電源を引き回したりするためのもの)。
 * **穴ではないので挿せない** — 半田付けする面であって、部品の足の行き先には
 * ならない。だからネットにもネットリストにも出さず、図の飾りとして描く。
 *
 * **既定では描かない。** 銅箔の無い板のほうが多く、無い板に描くと
 * 「そこに何か付けられる」と読めてしまう。
 */

/** 銅箔の幅と長さ (辺に垂直な向きが長さ)。穴の縁の余白に収まる大きさ。 */
const PAD_ACROSS = 8;
const PAD_ALONG = 10;
const PAD_ROUND = 3;

export function renderSlots(board: Board, layout: Layout, theme: Theme): string {
  const edges = slotEdges(board);
  if (edges === null) return '';

  const pads: string[] = [];

  const pad = (cx: number, cy: number, w: number, h: number): string => element('rect', {
    x: num(cx - w / 2), y: num(cy - h / 2), width: num(w), height: num(h), rx: PAD_ROUND,
    fill: theme.palette.slot, stroke: theme.palette.plateEdge, 'stroke-width': 1,
  });

  // **穴 1 つぶん離す。** 穴の間隔と同じだけ空けると、銅箔が穴の列の続きに
  // 見えない (詰めると「そこにも挿せる」と読める)。`createLayout` が
  // その辺の縁を 1 ピッチ広げてあるので、板の中に収まる。
  // **列の端は `colX(1)` とは限らない。** 裏返した板 (`style: back`) では
  // 列の並びが逆になるので、番号ではなく**位置の端**から測る。
  const outer = (a: number, b: number): { readonly low: number; readonly high: number } =>
    ({ low: Math.min(a, b), high: Math.max(a, b) });

  if (edges === 'sides') {
    const { low, high } = outer(layout.colX(1), layout.colX(board.cols));
    const leftX = low - PITCH;
    const rightX = high + PITCH;
    for (let row = 1; row <= board.rows; row += 1) {
      pads.push(pad(leftX, layout.rowY(row), PAD_ALONG, PAD_ACROSS));
      pads.push(pad(rightX, layout.rowY(row), PAD_ALONG, PAD_ACROSS));
    }
  } else {
    const { low, high } = outer(layout.rowY(1), layout.rowY(board.rows));
    const topY = low - PITCH;
    const bottomY = high + PITCH;
    for (let col = 1; col <= board.cols; col += 1) {
      pads.push(pad(layout.colX(col), topY, PAD_ACROSS, PAD_ALONG));
      pads.push(pad(layout.colX(col), bottomY, PAD_ACROSS, PAD_ALONG));
    }
  }

  return pads.join('');
}
