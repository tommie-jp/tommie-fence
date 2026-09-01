import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');
const production = process.argv.includes('--production');

/**
 * いずれも CommonJS で出す。拡張ホスト (デスクトップ・web とも) が require で
 * 読み込むためと、依存の yaml が CJS 実装を持ち込む
 * (ESM 出力だと dynamic require で落ちる) ため。
 * package.json は "type": "module" なので拡張子は .cjs にする。
 *
 * CLI (dist/cli.cjs) はまだ無い。Phase 6 で足す。
 */
const targets = [
  {
    entryPoints: ['src/extension/extension.ts'],
    outfile: 'dist/extension.cjs',
    format: 'cjs',
    platform: 'node',
    external: ['vscode'],
  },
  {
    // vscode.dev / github.dev 用。描画コアは DOM にも node: にも依存しないので
    // 同じエントリをブラウザ向けに束ね直すだけでよい。
    entryPoints: ['src/extension/extension.ts'],
    outfile: 'dist/extension.web.cjs',
    format: 'cjs',
    platform: 'browser',
    target: 'es2022',
    external: ['vscode'],
  },
];

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
