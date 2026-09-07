import { createRequire } from 'node:module';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import * as esbuild from 'esbuild';
import { collectExamples } from './scripts/examples.mjs';
import { iconPng } from './scripts/icon.mjs';

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

/**
 * スマホの入口 (PWA)。**絵札はここで焼く** — 外から持ってこない決めなので、
 * ラスタライザは足さず favicon と同じ図案を zlib で PNG に詰める
 * (52 の docs/35)。
 *
 * 道は相対で書く。**置き場が 2 つある** — GitHub Pages の
 * `/tommie-fence/` と、手元の `/` (`doPlayground.sh`)。相対なら
 * どちらでも同じ manifest が効く。
 */
for (const size of [180, 192, 512]) {
  await writeFile(`dist/icon-${size}.png`, iconPng(size));
}

const icon = (size, purpose) => ({
  src: `icon-${size}.png`, sizes: `${size}x${size}`, type: 'image/png', purpose,
});
await writeFile('dist/manifest.webmanifest', `${JSON.stringify({
  name: 'tommie-fence playground',
  short_name: 'tommie-fence',
  description: 'Markdown のフェンスで電子工作の図を描く',
  lang: 'ja',
  start_url: '.',
  scope: '.',
  display: 'standalone',
  background_color: '#f6f8fa',
  theme_color: '#f6f8fa',
  icons: [icon(192, 'any'), icon(512, 'any'), icon(512, 'maskable')],
}, null, 2)}\n`);

// TeX の資材 (WASM・コアダンプ・スタイル・フォント) は **node_modules から写す**。
// リポジトリには置かない — 8.5 MB のバイナリで、node-tikzjax が版ごとに持っている
// ものをこちらで持ち直す理由が無い。落とすのは circuit の図を初めて描くときだけ。
const require = createRequire(import.meta.url);

/**
 * 拡張の版。**頁の頭に出す** (実機で「tommie-fence の後にバージョンを表示する」)。
 * ここで焼き込むのは、頁が版を知る手立てがこれしか無いため — 実行時に
 * `package.json` を読ませると、Pages に置くファイルが 1 つ増える。
 */
const version = require('../tommie-fence/package.json').version;
/**
 * 控え役 (service worker)。**版を差し込む** — 版が変わると控えの名前が変わり、
 * 古い控えは捨てられる。開発では組み立てのたびに変えたいので時刻も混ぜる。
 */
const build = production ? version : `${version}-${Date.now()}`;
await writeFile('dist/sw.js', (await readFile('src/sw.js', 'utf8')).replace('__BUILD__', build));
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
  define: { __VERSION__: JSON.stringify(version) },
  logLevel: 'info',
};

/**
 * マップの中 (iframe) で動く 1 本。**拡張と同じ形** — 束ねた 1 本を
 * webview が読む。頁の側 (module) とは別の世界なので iife で出す。
 */
const mapOptions = {
  entryPoints: ['src/map/webview.ts'],
  outfile: 'dist/map.js',
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  sourcemap: !production,
  minify: production,
  logLevel: 'info',
};

if (watch) {
  // 見張るのは束ねるものだけ。HTML と CSS と例と TeX の資材は build のたびに写す。
  for (const one of [options, mapOptions]) {
    const context = await esbuild.context(one);
    await context.watch();
  }
} else {
  await esbuild.build(options);
  await esbuild.build(mapOptions);
}
