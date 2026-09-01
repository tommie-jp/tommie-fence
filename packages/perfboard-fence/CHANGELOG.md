# 変更履歴

書き方は [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/)、
版のつけ方は [Semantic Versioning](https://semver.org/lang/ja/) に従う。

## [Unreleased]

### Added

- パッケージの骨格。` ```perfboard ` フェンスを認識し、読めなかったところを
  行番号つきのカードで返す (Phase 0)。
- **板と穴を描くようになった** (Phase 1)。`board: 28x18` (列 × 行) と書くと、
  その大きさの板が、行の名前 (`a` `b` … `aa`) と列の番号を添えて出る。
  番地は `b3` の形。部品と配線はまだ描かない。
