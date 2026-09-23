import { THEME_CSS } from './theme.ts';

/**
 * マップの中 (iframe) で動く側の **VS Code の外での入口**。束ねると
 * `dist/map.web.js` になる (`fence-kit/map.web.js`)。中身は拡張の webview と
 * 同じ `map.ts` — 掴む・置く・消すの決め事は 3 つのフェンスで同じもので、
 * 宿主が違っても 1 本を読む。
 *
 * ここが足すのは、VS Code が webview に与えているものの肩代わり 2 つだけ:
 * 送り口 (`acquireVsCodeApi`) と、色の変数 (`--vscode-*`)。3 つ目のシム
 * (`DocLike`) は宿主の頁の側 (殻の `SessionHost`) にある。
 * playground が最初の宿主で、QR ノートが 2 つ目になったので引き上げた
 * (52 の docs/59)。
 */

/** 送り先は親の頁。中は宿主の出す `srcdoc` なので、相手を絞る意味は無い。 */
const api = { postMessage: (message: unknown): void => window.parent.postMessage(message, '*') };

(window as unknown as { acquireVsCodeApi: () => typeof api }).acquireVsCodeApi = () => api;

const style = document.createElement('style');
style.textContent = THEME_CSS;
document.head.append(style);

/**
 * **色と送り口を用意してから**中身を動かす。`map.ts` は読み込んだ瞬間に
 * `acquireVsCodeApi()` を呼ぶので、静的な import (先に評価される) では
 * 送り口が無くて止まる。束ねると 1 本の中に畳まれる (iife なので切り離さない)。
 */
export const started: Promise<void> = import('./map.ts').then(() => {
  // 開いた直後は全体を見せる。拡張のパネルは人が大きさを決められるが、
  // 頁の枠は決め打ちなので、初めから図が枠に収まっているほうがよい。
  document.querySelector<HTMLButtonElement>('.kc-fit')?.click();
});
