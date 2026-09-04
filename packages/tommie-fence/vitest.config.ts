import { defineConfig } from 'vitest/config';

export default defineConfig({
  // **`vscode` は VS Code の中にしか無い。** 拡張の入口を node で動かすために、
  // 受け止めるだけの代わりへ差し替える (`test/vscodeStub.ts`)。
  resolve: { alias: { vscode: new URL('test/vscodeStub.ts', import.meta.url).pathname } },
  test: { include: ['src/**/*.test.ts'] },
});
