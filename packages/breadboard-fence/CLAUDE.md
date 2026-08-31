# プロジェクト指示 (breadboard-fence)

Markdown の ` ```breadboard ` フェンスをブレッドボード実体配線図としてレンダリングする
VS Code 拡張機能。全体像は [README.md](README.md)、文法は [docs/01-syntax.md](docs/01-syntax.md)。

## 設計上の約束

1. **コアは同期の純関数に保つ**: `renderBreadboard(source)` は DOM・Node API・
   子プロセス・WASM を使わない。VS Code のプレビュー・CLI・他アプリのサーバー側描画の
   どこから呼んでも同じ SVG になることが、この設計の存在理由。
2. **実行時の依存を増やさない**: 埋め込み先を重くしないため、依存は YAML パーサだけ。
   スキーマ検証ライブラリは圧縮後 320KB 増えたので手書きに戻した経緯がある
   (`src/core/parser/schema.ts`)。
3. **図に出る文字は必ずエスケープする**: VS Code のプレビューは拡張が返した HTML を
   サニタイズしない。`src/core/render/svg.ts` の `escapeXml` が唯一の防御なので、
   SVG を組み立てるときは `element()` / `svgText()` を通す。文字列連結で属性や
   テキストを作らない。
4. **入力に上限を置く**: 他人の書いたノートを描く前提。部品数・配線数・ピン数・
   ラベル長の上限は `src/core/limits.ts` に集約する。
5. **エラーを握りつぶさない**: 読めなかった行は行番号つきで報告する。
   **図の SVG には書き込まない** (書き出した SVG を貼ったときに報告が付いてこないように)。
   出し先はプレビューの HTML と CLI の標準エラーで、文面は `render/errorText.ts` に揃える。
   「読めてはいるが思ったとおりに出ない」ものは notices として分け、
   `style: debug: off` で伏せられるのはそちらだけにする。

## 運用ルール

1. **マージは fast-forward のみ**: マージコミットを作らない。作業ブランチを切って
   コミットし、`git merge --ff-only` で main に取り込み、ブランチを消す。
2. **コミットは conventional commits 形式** (`feat:` / `fix:` / `docs:` / `chore:` など)。
3. **TDD**: テストを先に書いて落とし、実装で通す。`npm run check` (型チェック + テスト)
   を通してからコミットする。カバレッジは 80% 以上を維持する。
4. **Markdown は lint を通す**:
   `npx markdownlint-cli 'README.md' 'docs/*.md' 'examples/*.md' 'examples/errors/*.md' 'CHANGELOG.md'`。
5. **サンプルは再生成してコミット**: 描画を変えたら `npm run examples` を実行し、
   `examples/out` の差分も一緒にコミットする (スナップショットテストの期待値であり、
   README と文法メモが参照している図でもある)。
