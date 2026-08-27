import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');
const production = process.argv.includes('--production');

/**
 * node-tikzjax は WASM とフォントを実ファイルとして持ち歩き (`tex/` `css/`)、
 * jsdom も抱えている。束ねずに node_modules のまま .vsix へ同梱する。
 */
const TEX_ENGINE = 'node-tikzjax';

/**
 * いずれも CommonJS で出す。拡張ホスト (デスクトップ・web とも) が require で
 * 読み込むためと、依存の yaml が CJS 実装を持ち込む
 * (ESM 出力だと dynamic require で落ちる) ため。
 * package.json は "type": "module" なので拡張子は .cjs にする。
 */
const targets = [
  {
    entryPoints: ['src/extension/extension.ts'],
    outfile: 'dist/extension.cjs',
    format: 'cjs',
    platform: 'node',
    external: ['vscode', TEX_ENGINE],
  },
  {
    // vscode.dev / github.dev 用。core は DOM にも node: にも依存しないので
    // ブラウザ向けにも束ねられる (node の polyfill も要らない)。
    // 描画だけは WASM の TeX が要るため、web 版のエントリは
    // 「描けない」と返すスタブを入り口で差し込む (esbuild の alias は
    // パッケージ名しか受けないので、エントリを分けて解決する)。
    // package.json の "browser" がこの出力を指す。
    entryPoints: ['src/extension/extension.web.ts'],
    outfile: 'dist/extension.web.cjs',
    format: 'cjs',
    platform: 'browser',
    target: 'es2022',
    external: ['vscode'],
  },
  {
    // shebang は src/cli/main.ts の 1 行目にあり、esbuild がそのまま先頭に残す。
    entryPoints: ['src/cli/main.ts'],
    outfile: 'dist/cli.cjs',
    format: 'cjs',
    platform: 'node',
    external: [TEX_ENGINE],
  },
  // ここから 2 つはライブラリの出口 (`circuit-fence/core`)。サーバー側描画の
  // ように、YAML → TeX の変換だけを外から呼ぶためのもの。core は DOM にも
  // node: にも依存しないので neutral で束ねられる。yaml は束ねない —
  // ESM 出力に CJS 実装が混ざると dynamic require で落ちるため、依存として
  // 呼ぶ側の node_modules に任せる (dependencies に載っているので必ず居る)。
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
