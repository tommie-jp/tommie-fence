# Changelog

形式は [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/)、
バージョン番号は [Semantic Versioning](https://semver.org/lang/ja/) に従う。

## [Unreleased]

### Changed

- マップの状態欄: 番地が数の座標 (回路図の `x,y`) のときは数だけを出す (`statusCellText`)。ブレッドボードとユニバーサル基板は穴の番地のまま
- `coordsOf` が数の座標の番地 (`3,2`) にも端数を足す

## [0.18.0] - 2026-10-07

### Added

- `withSheets`: エディタを包み、`sheets:` の図をマップで枚ごとの仮のフェンスとして掴めるようにする。一覧に枚ごとの項目 (行は枚の頭)、選んだ枚の YAML を中のエディタへ渡し (頭に空行を足して行番号を元のフェンスと揃える)、書き換えの桁を字下げのぶん戻す。元の本文に無い行 (足した既定・作った題) の書き換えは断る (`SHEET_LINE_REFUSAL`)
- `FenceBlock.entry`: 一覧で選ばれている項目の行。殻 (`createSession`) は覚える行・図の鍵・一覧の選択にこれを使う (枚を選び直すと描き直す)。宿主への `onBind` は今までどおり開き記号の行

### Changed

- `splitSheets`: 名前の無い枚を `1枚目` から `1枚め` に、枚の題の末尾に必ず `(N枚め)` を付ける (枚が書いた `title:` にも)

## [0.17.0] - 2026-10-07

### Added

- ピンの名前の表に 1 列のモジュール・センサ 4 行: `KY-040` (ロータリーエンコーダのモジュール、`sip5`)・`HC-SR04` (超音波距離センサ、`sip4`)・`SG90` (RC サーボ、`sip3`)・`DHT11` (温湿度センサ、`sip4`)。色つきの胴で描く (52 の docs/121)
- `photocoupler6` (4N35、DIP6): `A` `K` `NC` `E` `C` `B`。PC817 (4 ピン) とはピンの数が違うので姿ではなく種類を分けた (DIP スイッチと同じ)。Vishay Document 81181 Rev. 1.2 で確かめた
- ディスクリートの表に `2N7002` (SOT-23、`G` `S` `D`。Nexperia Rev. 7 と Diodes DS11303 で確かめた)、負電圧レギュレータ `7905` (TO-220、`GND` `IN` `OUT`。TI uA79M00 SLVS060K の TOP VIEW から換算) と `79L05` (TO-92、`GND` `IN` `OUT`。TI LM79L05 SNOSBR8K の Bottom View から換算。**78L05 とは並びが違う**)
- 赤外 LED: LED の値 `ir` (水色がかった透明の胴)
- **データシートが食い違う 2 型番 (`2N7000` `2SD882`) の表の行に、「実物で確かめる」注意書きを同じ文面で置いた** (`VERIFY_NOTES`)。2N7000 は onsemi の 2007 年版の図が S G D、2022 年版の表が D G S で、表は 2007 年版に従う。2SD882 は ST の資料だけ図が B C E で、他は E C B、表は E C B。文書が文面を載せているかは試験が見張る
- `sheetLinks.ts`: `sheets:` の `links:` の線と行き先の札を積んだ図の左右の通り道に描く。`renderSheets` は枚の結果の `anchors` (節点の名前 → 座標) と `look` から描き、外へは返さない。`stackSheets` は `{ links, look }` を受け取れる。`linkColorOf` (+ は赤・GND は黒) と `SHEETS_ADVISED` (3) を出す (52 の docs/118)

### Changed

- `renderSheets`: 枚の間を 32 に、名前の無い枚を `1枚目` に、部品の名前の重なりをエラーに。版の印は最後の枚にだけ (`renderOne` に `stamp` を渡す)。4 枚以上はお知らせ

## [0.16.0] - 2026-10-06

### Added

- `sheets.ts` — `sheets:` の切り分け (`splitSheets`)・枚ごとの SVG を縦に積む (`stackSheets`)・`links:` でネットリストを併せる (`mergeNetlists`)・全体 (`renderSheets`)。perf・bread・copper が使う (52 の docs/118)
- 3 ピンのディスクリート (トランジスタ・FET・三端子レギュレータ) のピンの名前の表 `discretes.ts` (`lookupDiscrete` `discreteTable` `discreteModels`)。
  2SC1815・2SA1015・2SC2120・2SA950・2SC2655・2SA1020 (E C B)、2N3904・2N3906・PN2222A・2SC1008 (E B C)、P2N2222A (C B E)、
  2SD882・2SB772 (TO-126、E C B)、2SK30A (S G D)・2SK170・2SK117・2SJ74 (D G S)、2N7000 (S G D)・BS170 (D G S)、
  IRF520/540・IRLZ44N・IRF9540・2SK2231 (G D S)、7805 (IN GND OUT)・78L05 (OUT GND IN)・LM317 (ADJ OUT IN)。
  並びは「印字面を手前、ピンを下にして左から右」で、データシートの図で確かめた (出典は各行の `source`)。`scripts/discrete-rows.mjs` が文書の表を書き出す
- DIP のピンの名前の表に TL082 (TL072 と同じ並び)・NE5532・LM324・LM741・LM386・ATtiny85・ATmega328P を足した (TI・Atmel・Microchip のデータシートで確かめた)

### Changed

- マップの状態欄は、端数を受けるフェンス (circuit) では**数の座標 (x=列, y=行) を主**にして番地を括弧に回す (`7.3,2.7 (b2d7)`)。穴を指すブレッドボードと基板は番地のまま
- ピンで書いた端の線 (`cf-approx`) を破線から**少し薄い実線**にした (破線だと配線が切れて見える)

## [0.15.0] - 2026-10-05

### Changed

- `FenceEditor` の `step` / `stepsTo` に本文 (`source`) を渡す。番地の英字と数字のどちらが行かが基板のシルクで変わる
  (perfboard の `board: silk:`) ので、隣の穴の綴りを数えるのに本文の基板が要る。実装は引数を無視してよい

## [0.14.0] - 2026-10-05

### Added

- DIP スイッチ `dip-switch4` / `dip-switch8` (足は `A1`〜 / `B1`〜。k 番のスイッチは `Ak` と `Bk` の間の開いた接点)
- FPGA ボード `tang-nano-9k` (Sipeed Tang Nano 9K、48 本)。`BoardPart` に `rowSpan` `reach` `hdmi` `mark` を足し、`boardBox` はボードの定義を受けて縁の出を変えられる

## [0.13.0] - 2026-10-05

### Added

- 足の名前の表に ULN2003A (`ULN2003` `ULN2003APG` `ULN2003AN`) を足した (TI SLRS027T の端子図で確かめた)。
  1〜7 番は入力 `1B`〜`7B`、8 番は `GND` (印字は `E`)、9 番は `COM`、10〜16 番は出力 `7C`〜`1C`。働きは「7 回路のダーリントン (シンクドライバ)」

## [0.12.0] - 2026-10-04

### Added

- 部品表の欄の中身 `partKind` `valueWithRole` `partsMark` `bandColors` `capacitorMark` `PARTS_HEADINGS`
  (breadboard と perfboard の部品表で共有)

## [0.11.0] - 2026-10-04

### Added

- フェライトビーズ `ferrite-bead` の胴 (帯の無い濃い灰色の円筒)

## [0.10.0] - 2026-10-04

### Changed

- USB-C の変換基板を濃い青にし、足の名前をいつも図の上でパッドの下に刷る。刷り字は VBUS を `V` と縮める (配線で指す名前は `VBUS` のまま)

## [0.9.0] - 2026-10-04

### Added

- 足の名前の表の行に**面実装の胴の寸法** (`chip`。mm) — 3SK291 の SMQ (2.9 mm 角、胴の幅 1.5 mm、足の間隔 1.9 mm、足 0.4 mm で 4 番だけ 0.6 mm、印字 `U.F`)。`drawDipAdapter` に `chip` を渡すと変換基板に実寸の胴を載せて描く。1 列の変換基板は `drawSipAdapter`。1 列ヘッダの足の名前だけを描く `sipLegends`

## [0.8.0] - 2026-10-04

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
