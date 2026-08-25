# Changelog

形式は [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/)、
バージョン番号は [Semantic Versioning](https://semver.org/lang/ja/) に従う。

## [Unreleased]

### Added

- 図の下の部品リスト。`parts:` に書いた部品が ID・種類・値の順に 1 行ずつ並ぶ。
  **既定で出る**ので、これまでの図は部品リストのぶんだけ高くなる。
  `parts-list: none` で消せば従来と同じ図に戻る。
- `board:` のマップ形式。レールの並び (`rails`)・行ラベルの大小 (`letters`)・
  列番号の間引き (`numbers`) を、手元のボードの印字に合わせて選べる。
  番地系は印字に依らず共通で、既定値のときの出力は従来と同一。
- 番地は大小どちらでも書けるようにした (`A5` == `a5`、`+T5` == `+t5`)。

## [0.1.0] - 2026-08-25

初版。`.vsix` は [Releases](https://github.com/tommie-jp/breadboard-fence/releases)
から入手できる。

### Added

- Markdown の ` ```breadboard ` フェンスを、VS Code のプレビューで
  ブレッドボードの実体配線図としてレンダリングする。
- 穴の縦列の導通からネットリストを導出し、図と一緒に出す。
- 部品: resistor (値をカラーコードとして描く) / capacitor (電解は極性帯つき) /
  led / transistor (TO-92) / dipN (ピン 1 の穴だけで配置) / device (ボード外の機器)。
- 配線の自動ルーティングと、`[v-20]` 形式の迂回ヒント。
- `style:` で見た目を選べる 5 つのテーマ
  (classic / dark / high-contrast / mono / presentation)。既定は presentation。
  テーマの一部だけをマップで上書きすることもできる。
- フェンス内 YAML のシンタックスハイライト (injection grammar)。
- 行番号つきのエラー表示。
- CLI `breadboard-fence render` — `.md` / `.yaml` からスタンドアロン SVG を書き出す。
- サンプル 3 つ (LED、エミッタ接地アンプ、B-H カーブ測定回路)。
