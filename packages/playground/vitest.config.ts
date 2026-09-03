import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // main.ts は DOM を触るだけの薄い層 (決め事は他のモジュールにある)。
      // 3 つのコアの描画そのものは各パッケージのテストで覆う。
      //
      // src/tex の 4 つは **ブラウザでしか動かない** — fetch と
      // DecompressionStream と WebAssembly と DOMParser がそろって初めて動く。
      // node のテストで形だけ真似ても、確かめたことになるのは真似のほうになる。
      // ここはブラウザで実際に描いて確かめる (52 の docs/15)。
      // **tar の読み取りだけは純関数**なので、本物の資材で覆ってある。
      exclude: [
        'src/**/*.test.ts',
        'src/main.ts',
        'src/tex/assets.ts',
        'src/tex/engine.ts',
        'src/tex/svg.ts',
        'src/tex/index.ts',
      ],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
