import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');
const production = process.argv.includes('--production');

/**
 * **出すのは CLI だけ。** 拡張は `tommie-fence` に畳んだ (52 の docs/19) ので、
 * このパッケージはライブラリ + CLI になった。
 *
 * CommonJS で出すのは、依存の yaml が CJS 実装を持ち込むため
 * (ESM 出力だと dynamic require で落ちる)。package.json は "type": "module"
 * なので拡張子は .cjs にする。
 */
const targets = [
  {
    entryPoints: ['src/cli/main.ts'],
    outfile: 'dist/cli.cjs',
    format: 'cjs',
    platform: 'node',
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
