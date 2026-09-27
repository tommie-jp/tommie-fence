# Changelog

形式は [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/)、
バージョン番号は [Semantic Versioning](https://semver.org/lang/ja/) に従う。

## [Unreleased]

### Added

- **周波数の読み書き** (`parseHertz` `formatHertz` `formatHertzShort` `hertzUnit`)。
  vna と copper が同じ物を持っていたので引き上げた。接頭辞は `k` `M` `G`、単位は `Hz`
  だけ。`{ unit: 'required' }` で単位の無い綴りを断る (scope が使う)。
- **等幅の帯** (`mono.ts` — `monoText` `monoLinesSize` `monoTableSize` `renderMonoTable` など)。
  perfboard・copper・vna が同じ組み方を写して持っていた。行送りと余白は `MonoSpacing` で渡す。
- **`data:` の読み口** (`fence-kit/cli` の `readNeighbor`)。vna が持っていた物。
  シンボリックリンクを辿らず、通常のファイルだけを、上限まで読む。開いた後に、開いた物と
  名前の指す物が同じファイル (`dev` と `ino`) かを見直す (`O_NOFOLLOW` の無い OS での差し替えに備える)。
- **計器の画面の単位** (`units.ts` — `parseVolts` `parseSeconds` `parseDegrees` `parsePercent`
  `parsePerDiv` と `format*`)。**単位の無い数は読まない**。`-10dBm` は 50 Ω の正弦の peak に直す。
- **波形発生器の波** (`wave.ts` — `parseWave` `sampleWave` `periodOf`)。`sine 1kHz 1V offset 1V`。
  振幅は peak (`2Vpp` は半分、`Vrms` は sine だけ)。scope と spectrum が同じ綴りで使う
  (spectrum の線スペクトル `linesOf` は型 `SpectralLine` だけ先に置いた)。

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
