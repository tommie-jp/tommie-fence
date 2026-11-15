import * as esbuild from 'esbuild';

/**
 * **出すのは CLI だけ。** 3 つのフェンスの core を束ねて 1 本の cjs にする
 * (依存の yaml が CJS 実装を持ち込むので、ほかの CLI と同じく .cjs)。
 * 2 本め `part-card` は部品カードを確かめる CLI (52 の docs/158)。
 */
const ENTRIES = [
  ['src/cli/main.ts', 'dist/cli.cjs'],
  ['src/part/main.ts', 'dist/part-card.cjs'],
];

for (const [entry, outfile] of ENTRIES) {
  await esbuild.build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    format: 'cjs',
    platform: 'node',
    target: 'node20',
    logLevel: 'warning',
    // TeX のエンジンは WASM とフォントを実ファイルで持ち歩くので束ねない (circuit-fence と同じ)。
    external: ['node-tikzjax'],
  });
}
