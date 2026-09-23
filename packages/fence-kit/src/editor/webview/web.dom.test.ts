// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from 'vitest';
import { layDom, nextFrame } from './domFixture.ts';
import { panelHtml } from '../panelHtml.ts';

/**
 * **VS Code の外での入口** (`web.ts` → `dist/map.web.js`)。宿主の頁が
 * iframe に殻を開くと、これが送り口と色を用意してから `map.ts` を動かす。
 * 崩れると playground と QR ノートでだけ壊れ、拡張では気づけない (52 の docs/59)。
 */

/** 殻の頁の `<body>` の中身。図は 1 枡あれば足りる (見るのは段取りだけ)。 */
const bodyHtml = (): string => {
  const whole = panelHtml({
    cspSource: "'self'",
    nonce: 'n',
    scriptUri: 'map.web.js',
    undo: 'own',
    view: {
      html: '<svg data-box="0,0,100,100"><rect class="cf-cell" data-address="a1" data-box="0,0,20,20"></rect></svg>',
      picker: '',
      issues: '',
      chrome: {
        palette: '', typeNames: '', colorNames: '', swatches: '', foldsWire: false, fine: null, fineFor: 'all',
      },
    },
  });
  return whole.slice(whole.indexOf('<body'), whole.lastIndexOf('</body>')).replace(/^<body[^>]*>/, '');
};

const world = globalThis as unknown as Record<string, unknown>;

/** 足場を敷いて `web.ts` を読み込み、`map.ts` が動き出すまで待つ。 */
const open = async (): Promise<{ readonly sent: unknown[][]; readonly fitted: () => number }> => {
  layDom(bodyHtml());
  // 足場の送り口は外す。**`map.ts` が握るのは `web.ts` が置いたもの**でないといけない。
  delete world['acquireVsCodeApi'];
  const sent: unknown[][] = [];
  vi.spyOn(window.parent, 'postMessage').mockImplementation((...args: unknown[]) => { sent.push(args); });
  let fitted = 0;
  document.querySelector('.kc-fit')?.addEventListener('click', () => { fitted += 1; });

  vi.resetModules();
  const { started } = await import('./web.ts');
  await started;
  await nextFrame();
  return { sent, fitted: () => fitted };
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('VS Code の外で殻を開く', () => {
  test('hands the shell a postMessage that reaches the host page', async () => {
    const { sent } = await open();
    const undo = document.querySelector<HTMLButtonElement>('.cf-undo');
    expect(undo).not.toBeNull();
    undo!.disabled = false;

    undo!.dispatchEvent(new Event('click', { bubbles: true }));

    // `map.ts` の送り口が、親の頁への postMessage になっている。
    expect(sent).toContainEqual([{ kind: 'undo' }, '*']);
  });

  test('puts the VS Code colors in the head', async () => {
    await open();

    const styles = [...document.head.querySelectorAll('style')].map((one) => one.textContent ?? '');

    expect(styles.some((text) => text.includes('--vscode-foreground'))).toBe(true);
  });

  test('shows the whole diagram right after opening', async () => {
    const { fitted } = await open();

    expect(fitted()).toBe(1);
  });
});
