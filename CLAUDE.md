# プロジェクト指示 (tommie-fence)

電子工作の図を描く Markdown フェンス言語のモノレポ。全体像は
[README.ja.md](README.ja.md) (英語は [README.md](README.md))。
各パッケージの設計上の約束は `packages/*/CLAUDE.md` にあり、
**そちらがそのパッケージについては正**。ここには横断の作法だけを書く。

## 構成

- `packages/circuit-fence` — ` ```circuit ` フェンス。回路図 (circuitikz / TeX)
- `packages/breadboard-fence` — ` ```breadboard ` フェンス。ブレッドボード実体配線図
- (予定) `packages/perfboard-fence` — ユニバーサル基板。breadboard の盤面モデルが土台
- (予定) `packages/fence-kit` — 3 つで重複している部分の置き場

言語は別、作法は同じ。**先回りして共通化しない** — 実際に重複してから引き上げる。

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
3. **パッケージ間で依存するときは esbuild で束ねる**。`fence-kit` を作ったら、
   external にせず束ねる。外に置くと、1 の作業場での install が npm 上に無い
   パッケージを探しに行って失敗する。
4. **版はパッケージごとに独立**。揃えない (揃えると直していないパッケージまで
   版が上がって CHANGELOG が嘘になる)。**タグはパッケージ名を接頭辞にする**:
   `circuit-fence-v0.4.0`。旧リポジトリの `v0.3.0` 形式は archive 側に残る。
5. **CI はリポジトリ直下の `.github/workflows` だけが動く**。
   パッケージの中に置いても GitHub は読まない。
6. **マージは fast-forward のみ**。作業ブランチを切ってコミットし、
   `git merge --ff-only` で main に取り込み、ブランチを消す。
7. **コミットは conventional commits 形式**。
8. **Markdown は lint を通す**:
   `npx markdownlint-cli 'README.md' 'README.ja.md' 'CLAUDE.md'`。
   パッケージの中は各パッケージの CLAUDE.md の指定に従う。
9. **README は日本語が正、英語が追随**。節の構成は 2 本で 1 対 1 に保つ。

## パッケージ間で違っていて、揃えていないもの

**揃えるべきだが揃っていない**のではなく、**理由があって違う**。消さない。

| もの | circuit-fence | breadboard-fence | なぜ |
| --- | --- | --- | --- |
| web 版のエントリ | 専用の `extension.web.ts` (描けないと返すスタブ) | 同じ `extension.ts` を束ね直すだけ | 回路図の描画は WASM の TeX が要り、ブラウザで動かない |
| `previewRefresher` | ある | ない | 回路図は描画が非同期 (TeX → SVG) なので、描き上がってからプレビューを促す仕組みが要る。フェンスに依存しないので `fence-kit` の候補 |
| ライブラリの出口 | `circuit-fence/core` を `exports` で公開 | なし | サーバー側描画から呼ぶ要望があったのは回路図だけ |
| 実行時の依存 | `yaml` + `node-tikzjax` | `yaml` だけ | 同上 |
