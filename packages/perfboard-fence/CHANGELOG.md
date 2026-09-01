# 変更履歴

書き方は [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/)、
版のつけ方は [Semantic Versioning](https://semver.org/lang/ja/) に従う。

## [Unreleased]

### Added

- パッケージの骨格。` ```perfboard ` フェンスを認識し、読めなかったところを
  行番号つきのカードで返す (Phase 0)。
- **板と穴を描くようになった** (Phase 1)。`board: 28x18` (列 × 行) と書くと、
  その大きさの板が、行の名前 (`a` `b` … `aa`) と列の番号を添えて出る。
  番地は `b3` の形。
- **2 本足の部品を置けるようになった** (Phase 2)。
  `R1: resistor b3 b7 10k` と書くと、2 つの穴を結ぶ線の上に胴が寝る。
  抵抗は値が読めればカラーコードを塗り、LED は書かれた色で光る。
  1 つの穴に 2 本目の足は挿せないので、重なりは行番号つきで返す。
  3 本足・DIP・SIP と配線はまだ。
