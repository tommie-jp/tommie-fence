import { THEME_CSS } from './theme.ts';

/**
 * マップの中 (iframe) で動く側の入口。**中身は fence-kit にある** —
 * 掴む・置く・消すの決め事は 3 つのフェンスで同じもので、拡張の
 * `src/webview/map.ts` が読むのと同じ 1 本を読む。
 *
 * ここが足すのは、VS Code が webview に与えているものの肩代わり 2 つだけ:
 * 送り口 (`acquireVsCodeApi`) と、色の変数 (`--vscode-*`)。
 */

/** 送り先は親の頁。どちらもこの頁のものなので、相手を絞る意味は無い。 */
const api = { postMessage: (message: unknown): void => window.parent.postMessage(message, '*') };

(window as unknown as { acquireVsCodeApi: () => typeof api }).acquireVsCodeApi = () => api;

const style = document.createElement('style');
style.textContent = THEME_CSS;
document.head.append(style);

// **色と送り口を用意してから**中身を動かす (先に読むと送り口が無くて止まる)。
void import('fence-kit/webview').then(() => {
  // 開いた直後は全体を見せる。拡張のパネルは人が大きさを決められるが、
  // 頁の枠は決め打ちなので、初めから図が枠に収まっているほうがよい。
  document.querySelector<HTMLButtonElement>('.kc-fit')?.click();
});
