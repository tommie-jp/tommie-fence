import { describe, expect, test } from 'vitest';
import { THEME_CSS } from './theme.ts';

/**
 * **VS Code の外で殻を動かすときの色** (`web.ts` が iframe の頭に差す)。
 * 殻は `--vscode-*` で書かれているので、宿主の頁が同じ名前で配る
 * (52 の docs/15 §「マップは iframe が webview の役をした」)。
 */

/** `@media (prefers-color-scheme: dark) { … }` の中身。 */
const darkBlock = (): string => {
  const start = THEME_CSS.indexOf('@media (prefers-color-scheme: dark)');
  expect(start, '暗色の塊がない').toBeGreaterThanOrEqual(0);
  return THEME_CSS.slice(start);
};

describe('殻に配る色', () => {
  test('defines the VS Code variables the shell is written against', () => {
    for (const name of ['--vscode-foreground', '--vscode-editor-background', '--vscode-focusBorder']) {
      expect(THEME_CSS, name).toContain(name);
    }
  });

  test('follows the dark scheme of the device by default', () => {
    expect(darkBlock()).toContain('--vscode-editor-background');
  });

  test('lets the host keep the light colors with data-theme="light"', () => {
    // iframe の中には親の CSS が効かない。暗色を止める口は中の <html> に立てる
    // 印しか無い (52 の docs/59 の決め 4)。
    const firstRule = darkBlock().split('{')[1] ?? '';

    expect(firstRule.trim()).toBe(':root:not([data-theme="light"])');
  });

  test('keeps the form controls light too when the host says light', () => {
    // `color-scheme: light dark` のままだと、色を止めても入力欄と
    // スクロールバーだけが端末に合わせて暗くなる。
    expect(THEME_CSS).toMatch(/:root\[data-theme="light"\]\s*\{\s*color-scheme:\s*light;/);
  });
});
