import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');
const production = process.argv.includes('--production');

/**
 * **TeX エンジンは束ねない。** node-tikzjax は WASM とフォントを実ファイルとして
 * 持ち歩き (`tex/` `css/`)、`__dirname` からの相対で読む。抱えている jsdom も
 * `require.resolve('./xhr-sync-worker.js')` で自分の隣を見に行く。束ねると
 * どちらも `dist/` の隣を探しに行って、図を描くときに初めて落ちる
 * (「Cannot find module './xhr-sync-worker.js'」)。node_modules のまま
 * .vsix へ同梱する。畳む前の circuit-fence も同じ扱いだった。
 */
export const TEX_ENGINE = 'node-tikzjax';

/**
 * 3 つのフェンスを 1 つの拡張に束ねる。**コアは 3 つのまま**で、ここは入口だけ
 * (52 の docs/19)。CommonJS で出すのは拡張ホストが require で読むためと、
 * 依存の yaml が CJS 実装を持ち込むため。
 */
export const targets = [
  {
    entryPoints: ['src/extension.ts'],
    outfile: 'dist/extension.cjs',
    format: 'cjs',
    platform: 'node',
    external: ['vscode', TEX_ENGINE],
  },
  {
    // vscode.dev / github.dev 用。回路図の描画だけがスタブになる。
    entryPoints: ['src/extension.web.ts'],
    outfile: 'dist/extension.web.cjs',
    format: 'cjs',
    platform: 'browser',
    target: 'es2022',
    external: ['vscode'],
  },
  {
    // マップの webview の中で動くもの。**拡張ホストではなくブラウザ**なので別に束ねる。
    // 中身は fence-kit にあり、3 つのフェンスで同じ。
    entryPoints: ['../fence-kit/src/editor/webview/map.ts'],
    outfile: 'dist/map.js',
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
  },
];

/**
 * 束ねるのは、このファイルを直に走らせたときだけ (`node esbuild.mjs`)。
 * `bundle.test.ts` は上の表だけを読みたいので、import しても走らないようにする。
 */
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const target of targets) {
    const options = {
      bundle: true,
      target: 'node20',
      sourcemap: !production,
      minify: production,
      logLevel: 'info',
      ...target,
    };
    if (watch) {
      const context = await esbuild.context(options);
      await context.watch();
    } else {
      await esbuild.build(options);
    }
  }
}
