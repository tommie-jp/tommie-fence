/**
 * 図が描けたことをプレビューに知らせて、描き直させる。
 *
 * markdown-it の差し替えは同期なので、描けた図はプレビューを**もう一度**
 * 通さないと出てこない。1 枚ごとに描き直させると図の多いノートで何度も走るので、
 * まとめて 1 回にする。
 */

/** まとめる待ち時間。人が待たされたと感じない範囲で、連続した完了を 1 回にまとめる。 */
export const REFRESH_DELAY_MS = 120;

export type PreviewRefresher = { readonly request: () => void };

/**
 * 頼み先は呼ぶ側から渡す。vscode を知っているのは拡張の入口だけにしておくと、
 * ここはそのままテストできて、web 版でも同じものが使える。
 */
export function createPreviewRefresher(refresh: () => void): PreviewRefresher {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const request = (): void => {
    if (timer !== null) return;
    timer = setTimeout(() => {
      timer = null;
      try {
        refresh();
      } catch {
        // プレビューが閉じている・コマンドが無いなどで断られても、
        // 次に描けたときにまた頼めばよい (ここで止めない)。
      }
    }, REFRESH_DELAY_MS);
  };

  return { request };
}
