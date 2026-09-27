# Changelog

形式は [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/)、
バージョン番号は [Semantic Versioning](https://semver.org/lang/ja/) に従う。

## [Unreleased]

### Changed

- **`parsePicofarads` と `parseMicrohenries` は素の数 (`47` `470`) を読まない** (null)。接頭辞か
  単位 (`47p` `47pF` `100u` `10mH`) が要る。今までは pF・µH で読んでいた。
- **`resistorBands(0)` は黒 1 本** (0Ω のジャンパ)。今までは null。
- **部品の胴は、書いてあって読めない抵抗値を既定の帯で埋めない** (帯を描かない)。読めない値は
  フェンスの側で断る。値を書かなかった抵抗だけ既定の帯。

### Added

- **`parsePrefixedHertz` `isBareNumber` `HERTZ_HINT`** — フェンスの周波数の欄の読み。素の数
  (`10000000`) は null (vna と copper が使う。`parseHertz` は素の数も受けたまま)。
- **`partValueProblem(type, value)`** — breadboard と perfboard が部品の値を断る理由
  (読めない抵抗値・色の無い許容差と温度係数・コンデンサとインダクタの素の数)。直し方の例を添える。
- **周波数の読み書き** (`parseHertz` `formatHertz` `formatHertzShort` `hertzUnit`)。
  vna と copper が同じ物を持っていたので引き上げた。接頭辞は `k` `M` `G`、単位は `Hz`
  だけ。素の数も受ける (単位の無い数を断る欄は呼ぶ側が先に断る)。
- **等幅の帯** (`mono.ts` — `monoText` `monoLinesSize` `monoTableSize` `renderMonoTable` など)。
  perfboard・copper・vna が同じ組み方を写して持っていた。行送りと余白は `MonoSpacing` で渡す。
- **`data:` の読み口** (`fence-kit/cli` の `readNeighbor`)。vna が持っていた物。
  シンボリックリンクを辿らず、通常のファイルだけを、上限まで読む。開いた後に、開いた物と
  名前の指す物が同じファイル (`dev` と `ino`) かを見直す (`O_NOFOLLOW` の無い OS での差し替えに備える)。
- **計器の画面の単位** (`units.ts` — `parseVolts` `parseSeconds` `parseDegrees` `parsePercent`
  `parsePerDiv` と `format*`)。**単位の無い数は読まない**。`-10dBm` は 50 Ω の正弦の peak に直す。
- **波形発生器の波** (`wave.ts` — `parseWave` `sampleWave` `periodOf`)。`sine 1kHz 1V offset 1V`。
  周波数はほかの欄と同じ綴り (`1k` でも `1kHz` でも。素の数 `1000` は断る)。
  振幅は peak (`2Vpp` は半分、`Vrms` は sine だけ)。scope と spectrum が同じ綴りで使う
  spectrum の線スペクトル `linesOf` (sine 1 本、square と pulse は 4A/πn·|sin(πnd)|、triangle は
  奇数次 8A/π²n²、sawtooth は 2A/πn、dc と offset は 0 Hz の線)。`sampleWave` を FFT した値と一致する。
- **FFT と窓** (`dsp.ts` — `fft` `fftArrays` `kaiser` `nextPowerOfTwo`)。vna の TDR が持っていた
  逆 FFT と Kaiser 窓を、向き (`forward` / `inverse`) を引数にして引き上げた (spectrum が 2 つ目の使い手)。
  計器の窓 `windowOf` (`rect` `hann` `flattop`。周期形)。

## [0.1.0] - 2026-09-23

### Added

- **図を掴んで動かすエディタ (マップ) を、VS Code の外で動かせるようになった。**
  配る出口は 2 つ。版ごとの tgz は
  [Releases](https://github.com/tommie-jp/tommie-fence/releases) に
  `SHA256SUMS` つきで置く (npm には出していない)。
  - `fence-kit/shell` — 殻の宿主側 (`createSession` `panelHtml` `makeNonce`
    `changesForFence` `fenceToAppend` と型)。ESM (`dist/shell.mjs`)・CJS
    (`dist/shell.cjs`)・型定義 (`dist/types/shell.d.ts`)。**型定義は 1 ファイルに
    束ねてある** ので、tgz 1 つで型まで成り立つ。
  - `fence-kit/map.web.js` — iframe の中で動く 1 本。VS Code が webview に
    与える送り口 (`acquireVsCodeApi`) と色の変数 (`--vscode-*`) の肩代わり込み。
    これまで playground が持っていたものを引き上げた。
- **iframe の `<html>` に `data-theme="light"` を立てると、端末が暗色でも
  明るいままになる。** ダークモードを持たない宿主のため。既定は今までどおり
  端末の明暗に従う。

### 組み合わせ

殻の型 (`FenceEditor` など) は 3 つのコアの型定義にも写されている。
この版は circuit-fence 0.9.0 / breadboard-fence 0.10.0 / perfboard-fence 0.7.0 と
型が合う。
