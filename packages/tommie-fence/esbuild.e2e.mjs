import { build } from 'esbuild';

/**
 * 本物の VS Code で回す試験 (`test/e2e/`) を束ねる。**`.vsix` には入らない**
 * (`.vscodeignore` の `dist-test/**`)。
 *
 * どちらも CommonJS — 拡張ホストは `extensionTestsPath` を拡張と同じ読み方で
 * 読む (デスクトップは require、web は拡張ホストの CommonJS の読み手)。
 */
const common = { bundle: true, format: 'cjs', external: ['vscode'], sourcemap: 'inline', logLevel: 'warning' };

await Promise.all([
  build({ ...common, entryPoints: ['test/e2e/desktop.ts'], outfile: 'dist-test/e2e/desktop.cjs', platform: 'node', target: 'node20' }),
  build({ ...common, entryPoints: ['test/e2e/web.ts'], outfile: 'dist-test/e2e/web.cjs', platform: 'browser', target: 'es2022' }),
]);
