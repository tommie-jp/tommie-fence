import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // 拡張のエントリと CLI の入出力、webview の DOM 側は薄いラッパで、
      // 実質は core と状態遷移 (webview/mapState.ts) のテストで覆う。
      exclude: ['src/**/*.test.ts', 'src/extension/**', 'src/cli/main.ts', 'src/webview/map.ts'],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
