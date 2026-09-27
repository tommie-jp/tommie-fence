# 変更履歴

書き方は [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/)、
版のつけ方は [Semantic Versioning](https://semver.org/lang/ja/) に従う。

## [Unreleased]

### Added

- **7 つ目のフェンス ` ```spectrum `** — スペクトラムの画面。空でも 10 × 10 目盛の格子を描き、
  読めなかった行は図の下の帯と Problems に出す。**`device:` は必須** (`ad2` / `ad3` /
  `tinysa` / `tinysa-ultra` / `generic`。計算の道が変わるので既定を作らない)。
- CLI `spectrum-fence check|render|version` (vna・scope と同じ作法)。
- **2 つの計算の道** — FFT 型 (`ad2` `ad3`) は波を標本化 (fs = 掃引の終わり × 2.56。
  Nyquist より上の線は落とす) → 窓 (`rect` / `hann` / `flattop`) → FFT で dBV、掃引型
  (`tinysa` `tinysa-ultra` `generic`) は線スペクトルを RBW の山でなぞり、フロア
  (DANL + 10 log10(RBW ÷ 基準) + ATT − LNA) を足して dBm。同じ波が 2 つの道で同じ dBm になる。
- `signal:` は scope と同じ波の綴り (1 行か並び、16 本まで)。操作 (`| rc`) は断る。
- `sweep:` / `center:` + `span:`、`points:` (機種の選択肢に丸める)、`samples:` `window:`、
  `rbw:` (メニューの値。無ければ auto)、`atten:` `lna:`、`ref:` `scale:` `unit:` `floor:`。
  **片方の型にしか無いキーはもう片方で断る** (「ad2 では rbw: は書けません (…)」)。
- `markers:` (周波数か `peak`、4 つまで) と読み値の帯 (`1  100.000 MHz  −7.90 dBm`)。
  `check` が同じ字を出す。
- 例 5 本 (本の 11-4・11-2・11-3・11-5、AD の 4-2・4-3) とわざと壊した例 1 本。
