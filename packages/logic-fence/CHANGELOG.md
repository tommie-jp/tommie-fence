# 変更履歴

書き方は [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/)、
版のつけ方は [Semantic Versioning](https://semver.org/lang/ja/) に従う。

## [Unreleased]

## [0.1.0] - 2026-09-30

### Fixed

- 引用符で囲んだ値 (`window: "10s"`・`CLK: "dio0 clock 1Hz"`・`cursors: ["1s"]`) を読む。`cursors: 1s 2s` はリストで書くよう言う
- UART: 窓の左端で線が low のとき、データの中の立ち下がりをスタートビットに取って偽のフレームを出していた。
  線が 1 フレーム分 high になるまで読まず、お知らせを言う
- `start:` が 0 から遠いと `counter` が「edge が多すぎる」で落ちていた。クロックは式で数える
- `counter` に `repeat` だけ (sequence 無し) を書いても黙って無視していた → 断る。レーン・バス・読み下しの名前の重なりを言う
- 窓の右端ちょうどの変化が幅 0 のバスの区間を作っていた。`style: stamp: constructor` を on/off として受けていた

### Added

- **` ```logic ` フェンス — ロジックアナライザの画面** (WaveForms (Analog Discovery 3) の Logic を写す)。
  `device:` (`ad3` = DIO 16 本・125 MS/s・1 本 32,768 標本 / `generic`)、時間軸は `time: 1s/div` か
  `window: 10s` (目盛は 10 で固定)・`start:`・`sample:`
- **信号** (`signals:`) — `clock` (`duty`)・`pulse`・`pattern` (`from` `repeat`)・`high` `low`・`edges`・
  `counter` (前のレーンの edge を数えて `名前0`〜のレーンの束を作る。`start` `wrap` か `sequence`、`repeat`)。
  周波数・時間は単位が要る (素の数は断る)
- **バス** (`buses:`) — `名前: A3..A0 hex` (`hex` `bin` `dec` `sint`)。値の箱は変わり目で斜めに切り替わり、
  同時に変わるビットは 1 回の変化
- **カーソル** (`cursors:` X1・X2) と読み値の表 (行ごとの値・ΔX・1/ΔX)、**トリガの印** (`trigger:`。
  書いた edge が本当にあるかを確かめ、無ければお知らせ)
- **読み下し** (`decode:`) — UART (`uart TXD baud 9600 8N1 ascii`)。SPI と I2C はまだ書けない
- **検査とお知らせ** — 変わり目が 3 px より近いレーンは塗りで描いて言う・機種の標本化の上限とバッファ・
  2 標本より短い区間・窓の外のカーソルとトリガ・バスの 3 px より短い区間・sequence が edge より短い、を日本語で言う
- CLI の `check` はカーソルの表に加え、レーンの変わり目の数とバスの値と時刻の並びを出す
- docs (文法・早見表。本の 10-20 の図つき)・例 5 つと読めない例・`style:` (`theme` `width` `stamp` `debug`)
