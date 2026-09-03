import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // main.ts は DOM を触るだけの薄い層 (決め事は他のモジュールにある)。
      // 3 つのコアの描画そのものは各パッケージのテストで覆う。
      exclude: ['src/**/*.test.ts', 'src/main.ts'],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
