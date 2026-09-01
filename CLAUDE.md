# プロジェクト指示 (tommie-fence)

電子工作の図を描く Markdown フェンス言語のモノレポ。全体像は
[README.ja.md](README.ja.md) (英語は [README.md](README.md))。
各パッケージの設計上の約束は `packages/*/CLAUDE.md` にあり、
**そちらがそのパッケージについては正**。ここには横断の作法だけを書く。

## 構成

- `packages/circuit-fence` — ` ```circuit ` フェンス。回路図 (circuitikz / TeX)
- `packages/breadboard-fence` — ` ```breadboard ` フェンス。ブレッドボード実体配線図
- `packages/fence-kit` — 3 つで重複している部分の置き場。ビルド工程を持たず、
  使う側の esbuild が束ねる
- `packages/perfboard-fence` — ` ```perfboard ` フェンス。ユニバーサル基板。
  **骨格だけ** (Phase 0)。全穴が独立しているので、breadboard の `board` /
  `layout` / `place` / `router` はそのままでは使えない。**実測すると土台に
  なるのは盤面モデルではなく描画層のほう** (52 の docs/05)

言語は別、作法は同じ。**先回りして共通化しない** — 実際に重複してから引き上げる。
いま fence-kit にあるのは、実測で重複が確かめられたものだけ:
改行を揃える処理、フェンスの取り出し (言語名は引数)、markup のエスケープと
要素の組み立て。**描画は入っていない** — circuit は TeX に描かせるので
SVG を直に組み立てるコードを持たず、共有できるのが breadboard と
perfboard の 2 つだけだから。perfboard が描き始める Phase 1〜3 で、
要ったものから 1 つずつ引き上げる。

## コマンドはリポジトリ直下で

npm workspaces なので、`npm install` は直下で 1 回。lock も直下の 1 本だけ。

```bash
npm install
npm run check                                # 全パッケージの型チェック + テスト
npm run check --workspace=circuit-fence      # 1 つだけ
npm run examples --workspace=circuit-fence   # 図を作り直す
./doBuild.sh circuit-fence                   # .vsix を作って VS Code に入れ直す
./doVersion.sh circuit-fence minor           # 版を上げる
```

## 約束

1. **`vsce` を直に呼ばない**。`.vsix` を作るのは `./doBuild.sh <パッケージ>` だけ。
   workspaces は依存を直下の `node_modules` へ巻き上げるので、パッケージの中で
   `vsce package` を走らせると依存を外に探しに行き、同じファイルを 2 通りの経路で
   拾って「同じパスが 2 つある」と言って止まる。`doBuild.sh` はパッケージ単体を
   作業場へ写して単独で install してから詰める。
2. **パッケージは単体で install できる形を保つ**。1 の段取りが成り立つ前提。
   devDependencies を直下へ集約しない (各パッケージに置いたままにする)。
   パッケージのビルドが要るファイルは、そのパッケージの中に置く
   (`esbuild.mjs` を共通化しないのはこれが理由)。
3. **パッケージ間で依存するときは esbuild で束ねる**。`fence-kit` は
   external にしない。`.vsix` に実体は入らないので、依存の種類としては
   **devDependencies が正しい** (実行時には要らない)。
   `doBuild.sh` は作業場へ写すとき、モノレポ内の依存を隣に置いて
   `file:` 指定に書き換える。npm 上に無いパッケージを探しに行かせないため。
4. **版はパッケージごとに独立**。揃えない (揃えると直していないパッケージまで
   版が上がって CHANGELOG が嘘になる)。**タグはパッケージ名を接頭辞にする**:
   `circuit-fence-v0.4.0`。旧リポジトリの `v0.3.0` 形式は archive 側に残る。
5. **CI はリポジトリ直下の `.github/workflows` だけが動く**。
   パッケージの中に置いても GitHub は読まない。
6. **README の図と相対リンクは `vsce` が絶対 URL へ書き換える**。基準の既定は
   リポジトリ直下なので、モノレポでは `packages/<パッケージ>` の分が足りない。
   `doBuild.sh` が `package.json` の `repository.directory` から基準を作って
   `--baseContentUrl` / `--baseImagesUrl` で渡している。**パッケージを別の
   深さへ動かすなら `repository.directory` も直す** — 忘れると Marketplace と
   拡張ページの図が黙って 404 になる (ローカルの相対リンクは正しいままなので
   気づけない)。`examples/` をパッケージの外へ出せないのも同じ理由。
7. **マージは fast-forward のみ**。作業ブランチを切ってコミットし、
   `git merge --ff-only` で main に取り込み、ブランチを消す。
8. **コミットは conventional commits 形式**。
9. **Markdown は lint を通す**:
   `npx markdownlint-cli 'README.md' 'README.ja.md' 'CLAUDE.md' 'examples/*.md'`。
   パッケージの中は各パッケージの CLAUDE.md の指定に従う。
10. **README は日本語が正、英語が追随**。節の構成は 2 本で 1 対 1 に保つ。

## パッケージ間で違っていて、揃えていないもの

**揃えるべきだが揃っていない**のではなく、**理由があって違う**。消さない。

| もの | circuit-fence | breadboard-fence | なぜ |
| --- | --- | --- | --- |
| web 版のエントリ | 専用の `extension.web.ts` (描けないと返すスタブ) | 同じ `extension.ts` を束ね直すだけ | 回路図の描画は WASM の TeX が要り、ブラウザで動かない |
| `previewRefresher` | ある | ない | 回路図は描画が非同期 (TeX → SVG) なので、描き上がってからプレビューを促す仕組みが要る。フェンスに依存しないので `fence-kit` の候補 |
| ライブラリの出口 | `circuit-fence/core` を `exports` で公開 | なし | サーバー側描画から呼ぶ要望があったのは回路図だけ |
| 実行時の依存 | `yaml` + `node-tikzjax` | `yaml` だけ | 同上 |
| 図の組み立て | TeX (circuitikz) に描かせて後から色を塗り替える | SVG を直に組み立てる | だから `svg` `palette` `textFit` `title` にあたるものが circuit には無い。`theme` は名前が同じだけで別物 (circuit は塗り替えの色、breadboard は色 + 穴の寸法) |
| エラーの帯のキャレット | 全角を 2 桁と数えて位置を合わせる | 桁数だけ合わせる | 同じ `errorText.ts` という名前で別実装。**circuit の方が正しい**ので、揃えるなら breadboard を寄せる (未着手) |
