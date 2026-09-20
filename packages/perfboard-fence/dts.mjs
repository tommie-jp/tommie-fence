import { rollup } from 'rollup';
import { dts } from 'rollup-plugin-dts';

/**
 * ライブラリの出口 (`perfboard-fence/core`) の型定義を **1 ファイルに束ねる**。
 * 実装は esbuild が束ねる (`dist/core.mjs` / `core.cjs`) ので、ここは .d.ts 専用。
 *
 * **束ねるのは fence-kit が tgz に入らないから。** 同じモノレポのパッケージで、
 * devDependencies として esbuild に畳まれる (直下の CLAUDE.md の約束 3)。
 * ファイルごとに書き出すと `.d.ts` が `from 'fence-kit'` を指したまま配られ、
 * 使う側では解決できない。**`skipLibCheck: true` の使い手では黙って any に
 * 落ちる**ので、型が消えたことに気づけない (52 の docs/56)。
 *
 * `yaml` は外に残す。あちらは dependencies なので、使う側の node_modules に必ず居る。
 */
const bundle = await rollup({
  input: 'src/core/index.ts',
  external: ['yaml'],
  // **tsconfig を名指しで渡す。** 渡さないと rollup-plugin-dts は
  // moduleResolution を node10 に落とし、`exports` しか持たない fence-kit を
  // 解決できずに external 扱いする。**落ちずに素通りする**ので、
  // 束ねたはずの .d.ts が `from 'fence-kit'` を持ったまま出てくる。
  plugins: [dts({ respectExternal: true, tsconfig: 'tsconfig.json' })],
});

await bundle.write({ file: 'dist/types/index.d.ts', format: 'es' });
await bundle.close();
