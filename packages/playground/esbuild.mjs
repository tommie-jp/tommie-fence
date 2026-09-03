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

const options = {
  entryPoints: ['src/main.ts'],
  outfile: 'dist/app.js',
  bundle: true,
  format: 'iife',
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
