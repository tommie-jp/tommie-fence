import { createRequire } from 'node:module';
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import * as esbuild from 'esbuild';
import { collectExamples } from './scripts/examples.mjs';

/**
 * ページ 1 枚ぶんの組み立て。**外部から取ってくるものは無い** —
 * 3 つの描画コアも例も、ここで 1 つのディレクトリに収める
 * (GitHub Pages に置くだけで動く形にするため)。
 *
 * 3 つのコアは external にせず束ねる (fence-kit と同じ流儀)。
 * circuit は `circuit-fence/src/core` から入れる — `./core` は dist を指す
 * ライブラリの出口なので、先にあちらを build しないと型も中身も無い。
 */
const watch = process.argv.includes('--watch');
const production = process.argv.includes('--production');

// **前の組み立ての残りを消してから作る。** そのまま置いておくと、
// production で作り直したあとも開発版の .map (2 MB) が残り、
// Pages にはそれごと上がる。
await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });

// 例はビルド時に集める。取りこぼしたら collectExamples が止める。
const examples = collectExamples();
await writeFile('dist/examples.json', `${JSON.stringify(examples)}\n`);
console.log(`examples.json: ${examples.length} 本`);

for (const name of ['index.html', 'style.css']) {
  await cp(`src/${name}`, `dist/${name}`);
}

// TeX の資材 (WASM・コアダンプ・スタイル・フォント) は **node_modules から写す**。
// リポジトリには置かない — 8.5 MB のバイナリで、node-tikzjax が版ごとに持っている
// ものをこちらで持ち直す理由が無い。落とすのは circuit の図を初めて描くときだけ。
const require = createRequire(import.meta.url);
const tikzjax = require.resolve('node-tikzjax/package.json').replace(/package\.json$/, '');
await cp(`${tikzjax}tex`, 'dist/tex', { recursive: true });
await cp(`${tikzjax}css`, 'dist/tex/css', { recursive: true });

/**
 * **TeX の一式は別のかたまりにする。** circuit の図を描くところ
 * (`src/tex/`) は 400 KB 余りあり、breadboard と perfboard しか見ない人には
 * 要らない。`main.ts` が `import()` で呼ぶので、esbuild が切り離してくれる
 * (切り離しには ESM が要る。だから頁は `<script type="module">` で読む)。
 */
const options = {
  entryPoints: ['src/main.ts'],
  outdir: 'dist',
  entryNames: 'app',
  chunkNames: 'chunk-[hash]',
  bundle: true,
  splitting: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  sourcemap: !production,
  minify: production,
  logLevel: 'info',
};

if (watch) {
  // 見張るのは束ねるものだけ。HTML と CSS と例は build のたびに写す。
  const context = await esbuild.context(options);
  await context.watch();
} else {
  await esbuild.build(options);
}
