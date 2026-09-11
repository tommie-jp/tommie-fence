import { createWorkspace } from '../workspace.ts';
import { els } from './els.ts';

/**
 * 頁の文書。**欄が正** — 字はテキスト欄にあり、状態 (いまのフェンス・直したか・
 * 殻が直前に書き換えた所) は `workspace.ts` が数える (52 の docs/43 / 49)。
 */
export const ws = createWorkspace({
  text: () => els.source.value,
  setText: (next) => { els.source.value = next; },
});

/**
 * 文書に何が起きたか。**映す側 (`main.ts` の `sync`) が 1 か所で受ける** —
 * 各所が図・一覧・マップを個別に組み直すと、呼び漏らしが出る。
 * 種類ごとに何を組み直すかは `main.ts` の表が決める (足せば型が催促する)。
 *
 * - `open`: 別の文書を開いた
 * - `text`: 字が変わった (打鍵・「試す」)
 * - `replace`: 殻が書き換えた (**マップは組み直さない** — 殻はもう知っている)
 * - `select`: 見るフェンスを選び直した
 * - `bind`: 殻の側で選び直された (**マップは組み直さない** — 堂々巡りになる)
 * - `view`: 窓を開いた。図だけ描き直す
 * - `kept`: 書き戻した。直したままの印と「元に戻す」だけが変わる
 */
export type Change = 'open' | 'text' | 'replace' | 'select' | 'bind' | 'view' | 'kept';

let listener: ((kind: Change) => void) | null = null;

export function onChange(next: (kind: Change) => void): void {
  listener = next;
}

/** **映す側が居ないうちに呼ばれたら止まる** — 黙って何も映らないのが一番困る。 */
export function changed(kind: Change): void {
  if (listener === null) throw new Error(`映す側が居ないうちに ${kind} が来ました (onChange が先)`);
  listener(kind);
}
