import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

/**
 * iPhone の角とホームバーを避ける (52 の docs/50)。**2 つが揃って初めて効く** —
 * `viewport-fit=cover` が無いと `env(safe-area-inset-*)` は 4 辺とも 0 になり、
 * 余白の規則が黙って死ぬ。逆に規則が無いまま cover にすると、横向きで
 * 頁が切り欠きの下へ潜る。**どちらも実機でしか見えない**ので、ここで対を見張る。
 */

const read = (name: string): string => readFileSync(path.resolve(__dirname, name), 'utf8');

const SIDES = ['top', 'right', 'bottom', 'left'] as const;

/** `selector {` で始まる規則の中身を全部 (同じ選び手が媒体の塊の中にもある)。 */
const blocks = (css: string, selector: string): string[] => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [...css.matchAll(new RegExp(`(?:^|[}\\s])${escaped}\\s*\\{([^}]*)\\}`, 'g'))]
    .map((match) => match[1] ?? '');
};

const coversAllSides = (block: string): boolean =>
  SIDES.every((side) => block.includes(`env(safe-area-inset-${side})`));

describe('iPhone の角とホームバー', () => {
  const css = read('style.css');

  test('viewport は cover で開く (無いと safe-area の値が 0 になる)', () => {
    const viewport = /<meta\s+name="viewport"\s+content="([^"]*)"/.exec(read('index.html'))?.[1] ?? '';

    expect(viewport.split(',').map((one) => one.trim())).toContain('viewport-fit=cover');
  });

  test('畳んだ姿の頁は、4 辺とも safe-area の分を空ける', () => {
    expect(blocks(css, 'body.full').some(coversAllSides)).toBe(true);
  });

  test('画面いっぱいの Markdown の窓も、4 辺とも空ける', () => {
    expect(blocks(css, '.md-box').some(coversAllSides)).toBe(true);
  });
});
