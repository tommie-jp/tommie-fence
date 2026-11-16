// ESLint の設定 (52 の docs/164)。`npm run lint`。
//
// **型チェックと試験では見えない誤りだけを見る。** 使っていない変数・暗黙の any などは tsc が既に見ているので、
// ここでは足さない。今は非同期の取りこぼしの 3 つだけ:
//
// - no-floating-promises: `await` も `.catch` も無い Promise。拡張とプレビューは非同期が多く、
//   落ちても誰にも言われずに消える (TeX の描き上がり・ファイルの監視・webview への送信)
// - no-misused-promises: Promise を返す関数を、待たない所 (`if` の条件・イベントの受け口) に渡す
// - await-thenable: Promise でない物を `await` する (書き手の思い違いの印)
//
// 型の情報を使うので、各パッケージの tsconfig を読む (projectService)。規則を足すときは、
// 足した日に全部を直せる物だけを足す (警告を溜めない)。
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/node_modules/**', '**/dist/**', '**/dist-test/**', '**/out/**', '.build/**', '**/*.gen.ts', '**/examples/**', '**/.vscode-test*/**'],
  },
  {
    files: ['packages/*/src/**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: { '@typescript-eslint': tseslint.plugin },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
    },
  },
  {
    // マップの webview は DOM の型で読む別の tsconfig (本体の tsconfig の外)。
    files: ['packages/fence-kit/src/editor/webview/**/*.ts'],
    languageOptions: {
      parserOptions: { projectService: false, project: ['packages/fence-kit/tsconfig.webview.json'], tsconfigRootDir: import.meta.dirname },
    },
  },
);
