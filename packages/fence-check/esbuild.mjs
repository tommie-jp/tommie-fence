import * as esbuild from 'esbuild';

/**
 * **出すのは CLI だけ。** 3 つのフェンスの core を束ねて 1 本の cjs にする
 * (依存の yaml が CJS 実装を持ち込むので、ほかの CLI と同じく .cjs)。
 */
await esbuild.build({
  entryPoints: ['src/cli/main.ts'],
  outfile: 'dist/cli.cjs',
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'node20',
  logLevel: 'warning',
});
