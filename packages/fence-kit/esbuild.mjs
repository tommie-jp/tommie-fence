import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');
const production = process.argv.includes('--production');

/**
 * **配る形だけを束ねる** (52 の docs/59)。モノレポの中では誰もこれを通らない —
 * 拡張も playground も 3 つのコアも src を自分の esbuild で束ねる (直下の
 * CLAUDE.md の約束 3)。ここで作るのは VS Code の外の宿主 (QR ノートなど) に
 * tgz で渡すものだけ。
 *
 * fence-kit は `dependencies` を持たないので、external にするものが無い。
 */
const targets = [
  // 殻の宿主側 (`fence-kit/shell`)。**DOM も Node も触らない** (`purity.test.ts`
  // が見張る) ので neutral で束ねられる。宿主がどちらの形で読んでもよいよう 2 つ。
  {
    entryPoints: ['src/shell.ts'],
    outfile: 'dist/shell.mjs',
    format: 'esm',
    platform: 'neutral',
  },
  {
    entryPoints: ['src/shell.ts'],
    outfile: 'dist/shell.cjs',
    format: 'cjs',
    platform: 'neutral',
  },
  // iframe の中で動く 1 本 (`fence-kit/map.web.js`)。送り口と色の肩代わり込み。
  // **拡張・playground と同じ形** (iife / browser / es2022) — 頁の側 (module)
  // とは別の世界なので iife で出し、宿主は静的ファイルとして配るだけでよい。
  {
    entryPoints: ['src/editor/webview/web.ts'],
    outfile: 'dist/map.web.js',
    format: 'iife',
    platform: 'browser',
  },
];

for (const target of targets) {
  const options = {
    bundle: true,
    target: 'es2022',
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
