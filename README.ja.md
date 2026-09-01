# tommie-fence

[English](README.md) | [日本語](README.ja.md)

電子工作の図を描く Markdown フェンス言語のファミリーを、1 つのモノレポで育てる:
回路図、ブレッドボード、ユニバーサル基板。

| パッケージ | フェンス | 描くもの |
| --- | --- | --- |
| circuit-fence | ` ```circuit ` | 回路図 — 部品を番地で置き、ネットリストを導出する |
| breadboard-fence | ` ```breadboard ` | ブレッドボード実体配線図 — ボード内部の導通からネットリストを導出する |
| perfboard-fence (予定) | ` ```perfboard ` | ユニバーサル基板の配線図 — ブレッドボードの盤面モデルが土台 |

言語は別、作法は同じ: YAML をホストにしたフェンス、番地で書く位置、
Markdown の行番号とその行の中身で返るエラー。

## 状況

このリポジトリは組み立て中。
[circuit-fence](https://github.com/tommie-jp/circuit-fence) と
[breadboard-fence](https://github.com/tommie-jp/breadboard-fence) の履歴は
`packages/` 配下へ取り込み済み。全コミットがここにあり、
`git log packages/circuit-fence` で最初のコミットまで遡れる。
リリースと版タグは元のリポジトリに残る。こちらで打つ版タグはパッケージ名を
接頭辞にする (`circuit-fence-v0.4.0`)。2 つのパッケージは npm workspaces で
リポジトリ直下からビルド・テスト・パッケージできる。
`fence-kit` と `perfboard-fence` はまだ無い。

```text
tommie-fence
├── packages/fence-kit          共有: フェンス抽出、行番号エラー、SVG/theme、CLI 雛形
├── packages/circuit-fence
├── packages/breadboard-fence
└── packages/perfboard-fence
```

## 開発

`npm install` はリポジトリ直下で 1 回。lock も 1 本だけ。

```bash
npm install
npm run check                                # 全パッケージの型チェック + テスト
npm run check --workspace=circuit-fence      # 1 つだけ
npm run examples --workspace=circuit-fence   # 図を作り直す
./doBuild.sh circuit-fence                   # .vsix を作って VS Code に入れ直す
./doVersion.sh circuit-fence minor           # 版を上げる
```

**`vsce` は直に呼ばない。** workspaces は依存を直下の `node_modules` へ
巻き上げるので、`vsce package` はパッケージの外へ依存を探しに行き、同じ
ファイルを 2 通りの経路で拾って詰めるのを拒む。`doBuild.sh` はパッケージ単体を
作業場へ写して単独で install してから詰める。`.vsix` を作る道はこれだけ。

## ライセンス

MIT
