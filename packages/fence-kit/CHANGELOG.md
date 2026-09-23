# Changelog

形式は [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/)、
バージョン番号は [Semantic Versioning](https://semver.org/lang/ja/) に従う。

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
