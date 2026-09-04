import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // 拡張のエントリと CLI の入出力は薄いラッパで、実質は core のテストで覆う。
      exclude: ['src/**/*.test.ts', 'src/extension/**', 'src/cli/main.ts'],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
