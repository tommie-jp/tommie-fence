import { replaceFence } from '../document.ts';
import { SILKS, SILK_HINT, silkOf, withSilk } from '../silk.ts';
import type { Silk } from '../silk.ts';
import { els } from './els.ts';
import { say, warn } from './log.ts';
import { changed, ws } from './workspace.ts';

/**
 * perf の `silk:` の選び手 (52 の docs/108・118)。**perf のフェンスを見ているときだけ出す。**
 * 選ぶと、そのフェンスの `board:` の `silk:` の行を書き換える。マップへは文書の変化として流れる。
 */

export function buildSilk(): void {
  for (const silk of SILKS) {
    const option = document.createElement('option');
    option.value = silk;
    option.textContent = silk;
    option.title = SILK_HINT[silk];
    els.silk.append(option);
  }
}

/** いまのフェンスに合わせて、選び手を出す・隠す・指す。 */
export function syncSilk(): void {
  const fence = ws.current();
  const show = fence !== null && fence.kind === 'perfboard' && withSilk(fence.source, silkOf(fence.source)) !== null;
  els.silkPick.hidden = !show;
  if (show) els.silk.value = silkOf(fence.source);
}

export function listenSilk(): void {
  els.silk.addEventListener('change', () => {
    const fence = ws.current();
    if (fence === null) return;
    const silk = els.silk.value as Silk;
    const next = withSilk(fence.source, silk);
    if (next === null) {
      warn('board: の行が無いので silk: を書けません');
      return;
    }
    ws.setText(replaceFence(ws.text(), fence, next));
    changed('text');
    say(`silk: を ${silk} にした (番地が指す穴が変わります)`);
  });
}
