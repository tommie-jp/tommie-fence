import { rollup } from 'rollup';
import { dts } from 'rollup-plugin-dts';

/**
 * 殻の宿主の入口 (`fence-kit/shell`) の型定義を **1 ファイルに束ねる**。
 * 実装は esbuild が束ねる (`dist/shell.mjs` / `shell.cjs`) ので、ここは .d.ts 専用。
 *
 * **3 つのコアの `dts.mjs` の写し** (パッケージのビルドが要るファイルは
 * そのパッケージの中に置く。直下の CLAUDE.md の約束 2)。違うのは入口だけ。
 * ファイルごとに書き出すと `.d.ts` が相対の指定子を持ったまま配られ、
 * tgz が単体で成り立たない (52 の docs/56 の決め 2、docs/59 の決め 6)。
 * fence-kit は外の依存を持たないので、external は無い。
 */
const bundle = await rollup({
  input: 'src/shell.ts',
  // **tsconfig を名指しで渡す** (コアの dts.mjs と同じ)。渡さないと
  // rollup-plugin-dts は moduleResolution を node10 に落とし、型チェックと
  // 違う解決をする。束ね損ねても**落ちずに素通りする**ので、中身は CI が見る。
  plugins: [dts({ respectExternal: true, tsconfig: 'tsconfig.json' })],
});

await bundle.write({ file: 'dist/types/shell.d.ts', format: 'es' });
await bundle.close();
