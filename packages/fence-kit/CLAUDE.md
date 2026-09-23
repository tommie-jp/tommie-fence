# プロジェクト指示 (fence-kit)

3 つのフェンス (circuit / breadboard / perfboard) で重複している部分の置き場。
横断の作法は[リポジトリ直下の CLAUDE.md](../../CLAUDE.md)、
**このパッケージについてはここが正**。操作の説明は
[docs/01-図を掴んで動かす.md](docs/01-図を掴んで動かす.md)。

## 入口は 5 つ

| 入口 | 指す先 | 読むもの |
| --- | --- | --- |
| `fence-kit` | `src/index.ts` (**src**) | モノレポの中の全部。**DOM も Node も使わない** |
| `fence-kit/cli` | `src/cli/index.ts` (src) | 3 つのコアの CLI。**ここだけ Node を使ってよい** |
| `fence-kit/webview` | `src/editor/webview/map.ts` (src) | マップの中で動く側。拡張は道で直に束ねるので、いまは名前で読む所が無い |
| `fence-kit/shell` | `dist/shell.mjs` / `shell.cjs` / `types/shell.d.ts` (**dist**) | VS Code の外でマップの殻を動かす宿主 (tgz で受け取る) |
| `fence-kit/map.web.js` | `dist/map.web.js` (**dist**) | 同じ宿主が iframe に読ませる 1 本 |

**モノレポの中は src、外は dist** (3 つのコアの `./src/core` と `./core` の関係と
同じ)。`"."` を dist に向けると、`from 'fence-kit'` を持つ 156 ファイルが
build 待ちになる (52 の docs/59 の決め 1)。

## 約束

1. **本体は DOM も Node も使わない。外の依存を持たない。** VS Code の
   プレビュー・web 版・CLI・サーバー側描画のどこから呼んでも同じ結果に
   なるため。見張るのは `src/purity.test.ts` (許すものだけを並べる形)。
   ここに依存を 1 つ足すと 3 つ全部が重くなる。
2. **先回りして共通化しない。** 実際に重複してから引き上げる
   (直下の CLAUDE.md)。web 版の入口 (`web.ts` と `theme.ts`) も、playground に
   1 つ目があり、QR ノートが 2 つ目の宿主になったので引き上げた。
3. **DOM を触るファイルは `tsconfig.json` の `exclude` に並べる。**
   そちらは `tsconfig.webview.json` (DOM を知る設定) が見る。同じ webview の
   下でも DOM を知らないもの (`mapState.ts` / `previewGate.ts` / `theme.ts`) は
   本体側でも見張る。
4. **配る形は 3 つのコアと同じ** (直下の CLAUDE.md の約束 11)。`esbuild.mjs` が
   束ね、`dts.mjs` が型を **1 ファイルに**束ね、`prepack` がその 2 つを呼び、
   `.npmignore` が dist だけを残す。**ビルドはモノレポの中では誰も通らない** —
   拡張も playground も 3 つのコアも src を自分の esbuild で束ねる。
   だから配る形が壊れても型チェックとテストは素通りする。tgz の中身は
   CI が見る (`ci.yml` の `packed` の欄)。
5. **殻の API はここで変えない。** `SessionHost` も `Incoming` / `Outgoing` も
   宿主が頼っている面。宿主が足りないと言ってきたら、そのとき
   (書き換えの経路は 1 本。52 の docs/43)。

## 殻を他の宿主で動かす

マップの殻 (`session.ts` + `panelHtml.ts` + webview の `map.ts`) は VS Code を
知らない。VS Code が webview に与えているものを宿主が肩代わりすれば、
**殻も 3 つの文法も 1 行も変えずに動く** (52 の docs/15)。肩代わりは 3 つ:

| シム | 誰が持つ | 何を |
| --- | --- | --- |
| 送り口 (`acquireVsCodeApi`) | `web.ts` (`map.web.js` に入っている) | 殻の `postMessage` を親の頁へ送る |
| 色の変数 (`--vscode-*`) | `theme.ts` (同上) | VS Code のテーマの色を同じ名前で配る |
| 文書 (`DocLike`) | 宿主 (`SessionHost` を書く) | 文書の読み書き、カーソルの居場所 |

- 宿主の手順と例は [README.ja.md](README.ja.md)。1 つ目の宿主は playground
  (`packages/playground/src/map/`)。
- **明暗は既定で端末に従う。** 宿主が iframe の `<html data-theme="light">` を
  立てれば明るいまま (`theme.ts`)。iframe の中には親の CSS が効かないので、
  暗色を止める口は中の印しか無い。`srcdoc` は宿主と同じ出所なので、宿主は
  `load` で書ける。
- **型が変わったら 4 つ同時に切る。** `FenceEditor` などの殻の型は、
  `fence-kit/shell` の `.d.ts` と、3 つのコアの `./core` の `.d.ts` の**両方に
  写されている** (rollup-plugin-dts が畳む)。宿主はこの 2 つの写しを構造で
  突き合わせるので、片方だけ切ると宿主の型チェックが割れる。殻の型を変える
  変更を入れたら、fence-kit と 3 つのコアの版を同じ日に切る。

## 運用

```bash
npm run check --workspace=fence-kit      # 型チェック (本体と webview) + テスト
npm run build --workspace=fence-kit      # dist を作る (開発版。sourcemap つき)
npm pack --workspace=fence-kit           # 配る形 (prepack が本番の束ねと型を作る)
./doVersion.sh fence-kit minor           # 版を上げる。タグは fence-kit-v<版>
```

- **版は 0.1.0 から** (それまでは tgz を持たず、版に意味が無かった)。
  CHANGELOG の節が Release の説明になる (`release.yml`)。
- Markdown は lint を通す:
  `npx markdownlint-cli 'README.md' 'README.ja.md' 'CHANGELOG.md' 'CLAUDE.md' 'docs/*.md'`。
  設定は `.markdownlint.json` (MD013 行長・MD033 インライン HTML は無効)。
