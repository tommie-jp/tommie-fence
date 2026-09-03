# tommie-fence

[English](README.md) | [日本語](README.ja.md)

電子工作の図を描く Markdown フェンス言語のファミリーを、1 つのモノレポで育てる:
回路図、ブレッドボード、ユニバーサル基板。

| パッケージ | フェンス | 描くもの |
| --- | --- | --- |
| circuit-fence | ` ```circuit ` | 回路図 — 部品を番地で置き、ネットリストを導出する |
| breadboard-fence | ` ```breadboard ` | ブレッドボード実体配線図 — ボード内部の導通からネットリストを導出する |
| perfboard-fence | ` ```perfboard ` | ユニバーサル基板の配線図 — 全穴が独立していて、導通は配線でしか生まれない |

言語は別、作法は同じ: YAML をホストにしたフェンス、番地で書く位置、
Markdown の行番号とその行の中身で返るエラー。

## 何も入れずに試す

[![Codespaces で開く](https://github.com/codespaces/badge.svg)](https://codespaces.new/tommie-jp/tommie-fence?quickstart=1)

ブラウザの中に VS Code が立ち上がり、3 つの拡張が入った状態で
[examples/try-me.md](examples/try-me.ja.md) が開く。プレビュー
(`Ctrl+Shift+V`) でフェンスが図になり、書き換えると図が付いてくる。
GitHub のアカウントが要る (無料枠は月 120 コア時間)。

拡張は Releases の `.vsix` から入る。**この場でソースからは組まない** —
デモで見せるのは公開した版で、main の途中ではない。

## 状況

**ここが circuit-fence と breadboard-fence の新しい家。** 元の 2 つの
リポジトリ ([circuit-fence](https://github.com/tommie-jp/circuit-fence) /
[breadboard-fence](https://github.com/tommie-jp/breadboard-fence)) は
2026-09-01 に archive した。履歴は全コミットがこちらにあり、
`git log packages/circuit-fence` で最初のコミットまで遡れる。

**リリースはここから出る。** 版タグはパッケージ名を接頭辞にする
(`breadboard-fence-v0.4.0` / `circuit-fence-v0.3.1`)。archive したリポジトリに
残るのは `v0.3.0` までで、それ以降は
[Releases](https://github.com/tommie-jp/tommie-fence/releases) にある。

4 つのパッケージは npm workspaces でリポジトリ直下からビルド・テスト・
パッケージできる。

```text
tommie-fence
├── packages/fence-kit          共有: 改行の正規化、フェンス抽出、markup のエスケープ
├── packages/circuit-fence
├── packages/breadboard-fence
├── packages/perfboard-fence
└── packages/playground        3 つをブラウザで試す 1 枚の頁 (拡張ではない)
```

`fence-kit` に入れるのは、**実際に重複してから引き上げたものだけ**。
使う側の esbuild が束ねるので、ビルド工程も実行時の依存も持たない。

## ドキュメント

文法リファレンスと作例は、パッケージごとに持っている。
**[examples/](examples/README.ja.md) が入口** —
どのフェンスにも、そのフェンスを描いた図が並べてある。

[![RC ローパス](packages/circuit-fence/examples/out/01-rc-lowpass.png)](examples/README.ja.md)

[![ブレッドボードの LED と抵抗](packages/breadboard-fence/examples/out/01-led.png)](examples/README.ja.md)

| パッケージ | 文法 | 早見表 | 例 |
| --- | --- | --- | --- |
| circuit-fence | [docs/01-syntax.md](packages/circuit-fence/docs/01-syntax.md) | [docs/02-cheatsheet.md](packages/circuit-fence/docs/02-cheatsheet.md) | [examples/](packages/circuit-fence/examples/) — 回路 15 本、エラー例 5 本 |
| breadboard-fence | [docs/01-syntax.md](packages/breadboard-fence/docs/01-syntax.md) | [docs/02-cheatsheet.md](packages/breadboard-fence/docs/02-cheatsheet.md) | [examples/](packages/breadboard-fence/examples/) — 回路 13 本、エラー例 2 本 |

例はどのフェンスの直後にも**そのフェンスを描いた図** (`examples/out/`) を貼って
あるので、Markdown プレビューで開くとそのまま読み物になる。作り直しは
`npm run examples --workspace=<パッケージ>`。

## 開発

`npm install` はリポジトリ直下で 1 回。lock も 1 本だけ。

```bash
npm install
npm run check                                # 全パッケージの型チェック + テスト
npm run check --workspace=circuit-fence      # 1 つだけ
npm run examples --workspace=circuit-fence   # 図を作り直す
npm run build --workspace=playground         # 試す頁を組む (dist/ に出る)
./doBuild.sh circuit-fence                   # .vsix を作って VS Code に入れ直す
./doVersion.sh circuit-fence minor           # 版を上げる
```

**`vsce` は直に呼ばない。** workspaces は依存を直下の `node_modules` へ
巻き上げるので、`vsce package` はパッケージの外へ依存を探しに行き、同じ
ファイルを 2 通りの経路で拾って詰めるのを拒む。`doBuild.sh` はパッケージ単体を
作業場へ写して単独で install してから詰める。`.vsix` を作る道はこれだけ。

段取りは `Makefile` が持っていて、`doBuild.sh` は引数を make の目標に訳すだけ。
**触っていないパッケージは作り直さない。** make を直に呼んでもよい:

```bash
make                  # .vsix を全部作る (変わったものだけ)
make install          # 上に加えて VS Code に入れ直す
make circuit-fence    # 1 つだけ
make CHECK=0 install  # 型チェックとテストを飛ばす
make clean            # 作り直しの記録・作業場・.vsix を捨てる
make help             # 目標の一覧
```

## ライセンス

MIT
