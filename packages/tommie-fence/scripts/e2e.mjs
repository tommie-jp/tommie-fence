import { fileURLToPath } from 'node:url';
import { runTests } from '@vscode/test-electron';

/**
 * 本物の VS Code (デスクトップ) を落として立て、`test/e2e/` を回す。
 *
 *   npm run test:e2e -w tommie-fence
 *
 * VS Code は `.vscode-test/` に落ちる (.gitignore 済み)。**ほかの拡張は切る**
 * (`--disable-extensions`。組み込みの Markdown 拡張は残る)。開くのは
 * リポジトリの `examples/` (try-me.md がある)。画面の無い所では `xvfb-run -a` を前に付ける。
 */
const here = (path) => fileURLToPath(new URL(path, import.meta.url));

/**
 * **VS Code の端末から回すと、親の VS Code の印を受け継いでいる。**
 * `ELECTRON_RUN_AS_NODE` が残っていると、落とした VS Code が Node として立ち、
 * 開くフォルダを「読めないモジュール」と言って終わる。`VSCODE_*` は親の窓へ
 * 繋ぐ道 (IPC) なので、試す VS Code には渡さない。
 */
const env = Object.fromEntries(Object.entries(process.env)
  .filter(([key]) => key !== 'ELECTRON_RUN_AS_NODE' && !key.startsWith('VSCODE_')));
for (const key of Object.keys(process.env)) if (!(key in env)) delete process.env[key];

try {
  await runTests({
    version: process.env.VSCODE_TEST_VERSION ?? 'stable',
    extensionDevelopmentPath: here('..'),
    extensionTestsPath: here('../dist-test/e2e/desktop.cjs'),
    launchArgs: [here('../../../examples'), '--disable-extensions', '--disable-workspace-trust', '--skip-welcome', '--skip-release-notes'],
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
