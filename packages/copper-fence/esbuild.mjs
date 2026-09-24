import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');
const production = process.argv.includes('--production');

/**
 * **出すのは CLI とライブラリの出口。** 拡張は `tommie-fence` に畳んだ
 * (52 の docs/19) ので、
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
  // ここから 2 つはライブラリの出口 (`copper-fence/core`)。サーバー側描画のように、
  // YAML → SVG の描画だけを外から呼ぶためのもの。core は DOM にも node: にも
  // 依存しないので neutral で束ねられる (`src/core/purity.test.ts` が見張る)。
  // yaml は束ねない — ESM 出力に CJS 実装が混ざると dynamic require で落ちるため、
  // 依存として呼ぶ側の node_modules に任せる (dependencies に載っているので必ず居る)。
  {
    entryPoints: ['src/core/index.ts'],
    outfile: 'dist/core.mjs',
    format: 'esm',
    platform: 'neutral',
    target: 'es2022',
    external: ['yaml'],
  },
  {
    entryPoints: ['src/core/index.ts'],
    outfile: 'dist/core.cjs',
    format: 'cjs',
    platform: 'neutral',
    target: 'es2022',
    external: ['yaml'],
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
