import { describe, expect, test } from 'vitest';

/**
 * **殻を他の宿主で動かす入口** (`fence-kit/shell`)。配る形 (dist と tgz) を
 * 持つのはここだけで、本体の `"."` は src のまま (52 の docs/59 の決め 1・2)。
 * 出すものを増やすと宿主が頼る面が広がるので、**並べたものだけ**を出す。
 */
describe('fence-kit/shell', () => {
  test('exports only what a host of the map shell needs', async () => {
    const shell = await import('./shell.ts');

    expect(Object.keys(shell).sort()).toEqual([
      'changesForFence', 'createSession', 'fenceToAppend', 'makeNonce', 'panelHtml',
    ]);
  });

  test('hands out the same functions as the main entry', async () => {
    // 写しではなく同じもの。2 つの入口で殻の振る舞いが割れない。
    const [shell, main] = await Promise.all([import('./shell.ts'), import('./index.ts')]);

    for (const name of Object.keys(shell) as (keyof typeof shell)[]) {
      expect(shell[name], name).toBe(main[name]);
    }
  });
});
