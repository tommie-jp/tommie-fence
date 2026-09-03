import { finishSvg } from 'circuit-fence/src/core';
import type { NoteOverlay, Theme } from 'circuit-fence/src/core';
import { texToDvi } from './engine.ts';
import { dviToSvg } from './svg.ts';

/**
 * circuit の図をブラウザで描く。**拡張と同じ順番**で組む:
 * TeX → DVI → SVG → `finishSvg` (色の塗り替え・注釈・大きさ)。
 * 最後の 1 つは circuit のコアが持っているので、描き上がりは拡張と揃う。
 */

export type Drawing = { readonly svg: string; readonly tex: string };

export type Finishing = {
  readonly notes: readonly NoteOverlay[];
  readonly theme: Theme;
  readonly width: number | null;
};

/**
 * **描くのは 1 枚ずつ。** TeX のエンジンはモジュールの中に状態を持っていて、
 * 2 枚を並べて走らせると壊れる (node-tikzjax の README も同じことを言っている)。
 * 打鍵のたびに呼ばれるので、前の 1 枚が終わってから次を始める。
 */
let queue: Promise<unknown> = Promise.resolve();

async function draw(tex: string, finishing: Finishing, say: (text: string) => void): Promise<string> {
  const dvi = await texToDvi(tex, say);
  const svg = await dviToSvg(dvi);
  return finishSvg(svg, { ...finishing, fitToText: true });
}

export function drawTex(
  tex: string,
  finishing: Finishing,
  say: (text: string) => void,
): Promise<string> {
  // 前の 1 枚が失敗しても列は止めない (失敗も「終わった」と数える)。
  const next = queue.then(
    () => draw(tex, finishing, say),
    () => draw(tex, finishing, say),
  );
  queue = next.catch(() => undefined);
  return next;
}
