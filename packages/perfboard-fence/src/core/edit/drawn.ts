import { rememberRecentPerCards } from 'fence-kit';
import { renderPerfboard } from '../index.ts';

/**
 * 殻が使う、1 回描いた結果の控え (52 の docs/162)。**同じ本文なら描き直さない。**
 *
 * 殻は同じ本文で図を何度も描いていた — 升目の SVG (`view`)、帯の言うこと (`issuesOf`)、Problems (`problemsOf`)、
 * 配線の差分 (`diff`)。1 回 5〜16 ms の図を 3〜4 回描くので、マップの 1 操作が 1 コマ (16.7 ms) を越えていた。
 * 掴む層つき (`edit: true`) で 1 回描けば、SVG・言うこと・ネットリストの全部が取れる (言うこととネットリストは
 * 掴む層の有無で変わらない)。控えは直前の 2 本文 (元の本文と、試し当てのあと) で、部品カードの表ごとに分ける。
 *
 * **返した物を書き換えない** (次の呼び出しにも同じ物が返る)。
 */
export const drawnForEdit = rememberRecentPerCards((source: string) => renderPerfboard(source, { edit: true }));
