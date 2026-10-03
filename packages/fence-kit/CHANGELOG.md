# Changelog

形式は [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/)、
バージョン番号は [Semantic Versioning](https://semver.org/lang/ja/) に従う。

## [Unreleased]

### Changed

- USB Type-C の変換基板を実物どおり 4 ピン (`GND D+ D- VBUS`、14.5 × 9.2mm) で描く。`lookupConnector` は変換基板の足、回路図の記号用に `lookupConnectorSymbol` (CC1・CC2 まで) を分けた

## [0.7.0] - 2026-10-04

### Added

- 足の名前と働きの表に SFU455B (村田の 455 kHz セラミックフィルタ。1 列 3 本 = IN・GND・OUT。`SFU455A` `SFU455` でも)。行に `look` (樹脂の色と胴の字) を持たせ、`sipHeader` が橙の胴で描く (`SipLook`)

## [0.6.0] - 2026-10-04

### Added

- `lookupGateUnits(型番)` — ゲートの IC の回路ごとの足の番号 (74HC00 → 1・2 → 3、4・5 → 6 …)。足の名前の表の印字 (`1A` `1B` `1Y`、CD4000 系は `A` `B` `J` … の字の並び) から導く。回路図のゲートの足の番号 (circuit-fence) が使う
- **足の名前の表にロジック IC 38 型番** — 74HC14・00・10・11・27・20・30・132・125・126・393・164・4066・138・139・157・153・151・175・174・112・390・4040・4060・193・165・85・123・4051・4052・4053・244・541・240・573・574・161・194。TI のデータシートの端子図 (N) から写した。74HC86・02・74 もデータシートと突き合わせて「未確認」を外した (表の出典は `pinouts.ts` の頭書き)
- 表の行に `note` (文書の表に添える一言) と、文書の表の行を書き出す `scripts/pinout-rows.mjs`。全行に掛かる見張りの試験 (足の数・電源と GND・型番の重複)
- 足の名前と働きの表に 3SK291 (デュアルゲート MOSFET (N)、面実装 SMQ の 1〜4 番 = G1・G2・D・S。変換基板が SMQ の番号をそのまま使う前提)
- 足の名前と働きの表に 74HC86 (XOR ×4)・74HC02 (NOR ×4)・74HC74 (D フリップフロップ ×2)。データシートとの突き合わせは未済

## [0.5.1] - 2026-09-30

### Fixed

- **足の間隔の表 (`leadSpan`) が `constructor` などの継承された名前を引いていた** — 自分の持つ種類だけ引き、それ以外は既定の間隔にする

## [0.5.0] - 2026-09-30

### Added

- **足の名前と働きの表に 6 行**: 74HC163 (`4 ビット同期カウンタ (同期クリア)`)、74HC154 (`4 → 16 デコーダ`)、
  62256 (`SRAM 32K×8`)、6116 (`SRAM 2K×8`)、74HC245、74HC273。`dip16` / `dip20` / `dip24` / `dip28` で
  型番を書くと、胴に名前が出て部品表に働きが出る。

## [0.4.0] - 2026-09-29

### Added

- **`svgText` の `inkOpacity`** — 字そのものの不透明度。縁 (`haloOpacity`) とは別に、字の `<text>` に
  `opacity` を付ける (`<g>` で包まないので、名札を上の層へ移す処理はそのまま効く)。
  実体配線図の既定は `BOARD_INK_OPACITY` (0.7)。DIP・SIP の足の名前と名札に掛ける。

## [0.3.0] - 2026-09-29

### Added

- **`pinNameRow` / `pinNameInner` / `pinNameWidth` / `PIN_NAME_GAP`** — 板の外の機器の足の名前を横 1 列に
  並べるときの字の大きさ。隣の名前と `PIN_NAME_GAP` 空く大きさまで縮め、下限を割るなら 2 段に
  互い違いにする (breadboard と perfboard が同じ形で `GNDVCCOUT` を踏んだ)。

## [0.2.0] - 2026-09-29

### Changed

- **`dipChip` の足の名前の字は胴の片側ごとに 1 つの大きさ** (足ごとに縮めていたので、LM358 の
  `V-` と `IN1+` の字が揃わなかった)。隣どうしの名前の幅の和で決め、長い名前は短い隣が空けた所へ
  はみ出してよい (NE555 の `RESET` は縮まない)。端の名前は内へ寄せる。下限は 4.5。それでも縮むときは
  `GROUND` を `GND` と刷り、下限でも入らない `/` で働きを並べた名前は前の働きだけ (`LE/STROBE` → `LE`。
  上に線の印の `/Q1` はそのまま)。絵の字だけで、表の名前は変えない。
- **`dipChip` の `namesInside`** — 名前を胴の中、番号のすぐ内側に刷る (perfboard が使う)。立てた胴に
  名前を書いたときは、キャプションを胴の下に出す (真ん中に寝かせると両側の名前に重なった)。
- **SIP の足の名前の縁取りを半分透かす** (`BOARD_HALO_OPACITY`)。
- **`parsePicofarads` と `parseMicrohenries` は素の数 (`47` `470`) を読まない** (null)。接頭辞か
  単位 (`47p` `47pF` `100u` `10mH`) が要る。今までは pF・µH で読んでいた。
- **`resistorBands(0)` は黒 1 本** (0Ω のジャンパ)。今までは null。
- **部品の胴は、書いてあって読めない抵抗値を既定の帯で埋めない** (帯を描かない)。読めない値は
  フェンスの側で断る。値を書かなかった抵抗だけ既定の帯。

### Added

- **足の名前の表に 3 行を足した**: 74HC595・CD4511B・CD74HC283 (TI の SCLS041J・SCHS072B・SCHS176E で
  確かめた)。74HC595 の上に線の `OE` `SRCLR` は線を落とし、9 番の `QH′` は `QH'`。CD4511B の印字は
  入力 `A`〜`D` と出力 `a`〜`g` が大文字小文字だけ違う (回路図は足の名前を大文字小文字を問わず引く) ので、
  両方を `INA`〜`IND` と `Oa`〜`Og` にした — 片方だけ変えると、もう片方の印字で書いた配線が黙って
  別の足に付くため。表の名前が大文字小文字だけで重ならないことを試験で見張る。
- **足の名前の表に 8 行を足した**: CD4013B・CD4070B・CD40106B・74HC04・74HC08・74HC32・L293D・MCP3008
  (TI の SCHS023E・SCHS055E・SCHS097F・SCLS078H・SCLS081J・SCLS200F・SLRS008D、Microchip の DS21295D で確かめた)。
  CD4013B の Q の上に線は `/Q1` `/Q2`、L293D の `1,2EN` は `12EN`、MCP3008 は印字どおり `CS/SHDN`。
- **`dipChip` の `numbers`** — 渡すと番号を胴の縁、`names` を胴の外の足の向こう側 (胴の縁と
  隣の穴の列のあいだ、縁取りつき) に刷る 2 段になる。名前は 1 ピッチに収まるまで字を縮める。
  立てた胴 (足の列が縦。perfboard の `r90` / `r270`) だけは、外へ出すと隣の穴の列に字が乗るので
  胴の中 (番号の内側、キャプションの手前) に書く。渡さなければ今までと同じ絵。`drawNamedChip` はリレーとフォトカプラに番号を渡す (7 セグは今のまま)
  (52 の docs/95)。計画は名前を番号の 1 段内側に置く案だったが、ブレッドボードの胴 (e・f 行の間)
  には入らなかったので、判断の記録の代案 (胴の外) にした。
- **DIP の足の名前の表** (`parts/pinouts.ts` — `lookupPinout(model, pins)` `pinoutModels` `pinoutTable`)。
  型番 (大文字小文字を問わず完全一致。別名を行に並べる) と足の本数から、TI のデータシートの印字の
  足の名前を引く。本数がパッケージと合わない型番と表に無い型番は null。NE555・TLC555・LM358・
  TL071・TL072・CD4017B・CD4040B・CD4069UB・CD4071B・CD4081B・CD4011B・CD4001B の 12 行。
  3 つのフェンスが同じ表を読む (52 の docs/95)。
- **`svgText` の `haloOpacity`** — 縁取りの不透明度 (既定 1)。1 未満なら縁を字と別の `<text>`
  (aria-hidden) に分けて要素の `opacity` で透かし、字は不透明のまま上に重ねる。
  実体配線図の既定値は `BOARD_HALO_OPACITY` (0.5)。
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
