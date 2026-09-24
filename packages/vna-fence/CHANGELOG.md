# 変更履歴

書き方は [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/)、
版のつけ方は [Semantic Versioning](https://semver.org/lang/ja/) に従う。

## [Unreleased]

### Fixed

- **題と枠の見出しの Ω が Windows の VS Code で別の字に化けた** (`(0 Ω のスルー)` が
  `(0 и のスルー)`)。太字の字の種類を `system-ui` だけで指していたため、日本語の UI
  フォントの太字で描かれていた。太字 (題・枠の見出し・トレースの名前・マーカーの番号) は
  欧文のフォントを先に並べる (copper-fence 0.1.1 と同じ直し)。

## [0.1.0] - 2026-09-25

### Added

- **5 つ目のフェンス ` ```vna `** — VNA (NanoVNA) の画面。
- **機種と掃引** (`device:` `sweep:`) — `h4` `v2` `plus4`、`1M-300M 101` (線形、2〜1001 点)。
  掃引が機種の範囲を外れたらお知らせ。
- **理想の模型** (`dut:`) — CH0 から CH1 へ縦続する梯子 (ABCD 行列)。`series` / `shunt`
  の R・L・C と寄生分 (`esr` `esl` `cp`)、損失の無い線路 (`line Z0 長さ vf`) とスタブ
  (`open` / `short`)、1 端子にする終わり (`open` / `short`)。破線で描く。
- **測った値** (`data:`) — Touchstone 1.x (`.s1p` / `.s2p`、RI / MA / DB、Hz〜GHz)。
  **`.md` と同じ場所のファイルだけ** (名前に `/` も `..` も書けない、1 MB まで)。
  core は開かず、宿主が `DataSource` で渡す。実線で描く。
- **トレース** (`traces:`) — `logmag` `phase` `delay` `linear` `polar` `smith` `swr`
  `r` `x` `z` `tdr` (帯域通過のインパルス、Kaiser 窓)、4 本まで。同じ単位は 1 つの枠。
  |Z| だけの枠は対数。
- **マーカー** (`markers:`) と**読み値** — 図の下の表と CLI に NanoVNA の書式で。
  実測があれば実測 (一番近い点)、無ければ模型。TDR は一番高い山の距離。
- **注釈** (`notes:`) — `mark` `text` (番地は周波数と値。単位で枠が決まる)、`band`、
  `source`。**見た目** (`style:`) — テーマ (`light` `dark` `mono`)、幅、刻印、お知らせ。
- **CLI** `vna-fence check|render|--version`。`data:` は入力の `.md` の隣から読む。
- **Problems の口** `problemsOf` (マップの殻は持たない)。
