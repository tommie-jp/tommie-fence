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

このリポジトリは組み立て中。拡張機能はまだ元のリポジトリ —
[circuit-fence](https://github.com/tommie-jp/circuit-fence) と
[breadboard-fence](https://github.com/tommie-jp/breadboard-fence) — にあり、
履歴ごと `packages/` 配下へ取り込む予定。

```text
tommie-fence
├── packages/fence-kit          共有: フェンス抽出、行番号エラー、SVG/theme、CLI 雛形
├── packages/circuit-fence
├── packages/breadboard-fence
└── packages/perfboard-fence
```

## ライセンス

MIT
