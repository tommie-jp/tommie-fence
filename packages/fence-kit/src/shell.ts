/**
 * fence-kit/shell — **マップの殻を VS Code の外で動かす宿主**のための入口。
 *
 * 配る形 (`dist/shell.mjs` / `shell.cjs` / `types/shell.d.ts`) を持つのは
 * ここだけ。本体の `"."` は src を指したまま (モノレポの中の 156 ファイルを
 * build 待ちにしないため)。3 つのコアの `./core` (dist) と `./src/core` (src)
 * の関係と同じで、**モノレポの外は dist、中は src** (52 の docs/59 の決め 1)。
 *
 * 出すのは**殻の宿主が要るものだけ** (決め 2)。`"."` 全体を束ねると部品の姿・
 * 色・ネットまで乗る。並びは playground の `map/index.ts` と `map/host.ts` が
 * import している綴りそのもの。宿主がすることは 3 つ:
 *
 * 1. `createSession` に文書の読み書き (`SessionHost`) と、3 つのコアの
 *    `./core` が出す `createXEditor()` を渡す
 * 2. `panelHtml` で殻の頁を作って iframe の `srcdoc` に書く。
 *    `scriptUri` は `fence-kit/map.web.js` (送り口と色の肩代わり込み) を指す
 * 3. iframe と `postMessage` で話す (`Incoming` を `session.handle` へ、
 *    `Outgoing` を iframe へ)
 *
 * **殻の API はここで変えない。** 宿主が足りないと言ってきたら、そのとき
 * (書き換えの経路は 1 本。52 の docs/43)。
 */
export { createSession } from './editor/session.ts';
export type {
  Incoming, LitRange, MapView, Outgoing, Session, SessionHost, SessionOptions,
} from './editor/session.ts';
export { changesForFence } from './editor/docEdits.ts';
export type { Change } from './editor/docEdits.ts';
export { fenceToAppend } from './editor/newFence.ts';
export type { NewFence } from './editor/newFence.ts';
export type { DocLike, EditorLike } from './editor/documentLike.ts';
export type { Edit } from './editor/edits.ts';
export type { FenceEditor } from './editor/fenceEditor.ts';
export { makeNonce, panelHtml } from './editor/panelHtml.ts';
export type { MapViewHtml, PanelHtmlOptions } from './editor/panelHtml.ts';
