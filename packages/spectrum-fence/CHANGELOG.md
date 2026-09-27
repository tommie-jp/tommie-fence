# 変更履歴

書き方は [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/)、
版のつけ方は [Semantic Versioning](https://semver.org/lang/ja/) に従う。

## [Unreleased]

### Added

- **7 つ目のフェンス ` ```spectrum `** — スペクトラムの画面。空でも 10 × 10 目盛の格子を描き、
  読めなかった行は図の下の帯と Problems に出す。**`device:` は必須** (`ad2` / `ad3` /
  `tinysa` / `tinysa-ultra` / `generic`。計算の道が変わるので既定を作らない)。
- CLI `spectrum-fence check|render|version` (vna・scope と同じ作法)。
