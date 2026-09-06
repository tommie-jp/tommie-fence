import { describe, expect, test } from 'vitest';
import { TEX_ENGINE, targets } from '../esbuild.mjs';
import manifest from '../package.json' with { type: 'json' };

/**
 * **TeX エンジンを束ねてしまっていないか見張る。**
 *
 * node-tikzjax は WASM とフォントを `__dirname` からの相対で読み、抱えている
 * jsdom も `require.resolve('./xhr-sync-worker.js')` で自分の隣を見に行く。
 * 束ねると型チェックもテストも通り、`.vsix` も普通にできて、**図を描いた
 * ときに初めて**「Cannot find module './xhr-sync-worker.js'」で落ちる。
 * 3 つを 1 つに畳んだときに external が落ちて、実際にそうなった。
 */
const desktop = targets.find((target) => target.outfile === 'dist/extension.cjs');

describe('拡張ホスト側の束ね', () => {
  test('keeps the TeX engine out of the bundle so it loads its own wasm and fonts', () => {
    expect(desktop?.external).toContain(TEX_ENGINE);
  });

  test('ships the TeX engine as a real dependency because the bundle no longer carries it', () => {
    expect(Object.keys(manifest.dependencies)).toContain(TEX_ENGINE);
  });
});
