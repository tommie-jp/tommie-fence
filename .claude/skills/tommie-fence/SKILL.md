---
name: tommie-fence
description: Markdown の ```circuit / ```bread / ```perf / ```copper / ```vna / ```scope / ```spectrum / ```graph / ```logic フェンス (回路図・ブレッドボードの実体配線図・ユニバーサル基板の実体配線図・銅張り基板のマイクロストリップの寸法図・VNA (NanoVNA) の画面・オシロスコープの画面・スペクトラムアナライザ (tinySA / Analog Discovery) の画面・教科書の x-y グラフ (共振曲線・ボード線図・特性曲線)・ロジックアナライザの画面 (Analog Discovery の Logic のレーン・バス・カーソル・トリガ)) を書く・直す・読むときに使う。文法リファレンスの所在、CLI の check で読めたか・つながったかを確かめる手順、図を PNG に焼いて目で確かめる手順、フェンスどうしで取り違えやすい書き方をまとめてある。Use when writing or fixing circuit schematics, breadboard diagrams, perfboard layouts, copper-clad board (microstrip) drawings, VNA (NanoVNA) screens — Log Mag, Smith chart, SWR, TDR — oscilloscope screens (waveforms, trigger, cursors, Measurements), spectrum analyser screens (tinySA, Analog Discovery), textbook x-y graphs (resonance curves, Bode plots, characteristic curves), or logic analyser screens (lanes, buses, cursors, trigger, UART decode) in these Markdown fences.
---

# tommie-fence のフェンスを書く

以下、`<root>` はこのリポジトリの直下 (この SKILL.md の 3 つ上)。

## 1. どのフェンスか

| 描きたいもの | フェンス | 文法 (先に読む順) | 例 |
| --- | --- | --- | --- |
| 回路図 | ` ```circuit ` | `packages/circuit-fence/docs/02-cheatsheet.md` → `01-syntax.md` | `packages/circuit-fence/examples/*.md` |
| ブレッドボードの実体配線図 | ` ```bread ` | `packages/breadboard-fence/docs/02-cheatsheet.md` → `01-syntax.md` | `packages/breadboard-fence/examples/*.md` |
| ユニバーサル基板の実体配線図 | ` ```perf ` | `packages/perfboard-fence/docs/01-syntax.md` (早見表は無い。目次から要る節だけ) | `packages/perfboard-fence/examples/*.md` |
| 銅張り基板 (マイクロストリップ・CPW・Manhattan の島) の寸法図 | ` ```copper ` | `packages/copper-fence/docs/01-syntax.md` (早見表は無い) | `packages/copper-fence/examples/*.md` |
| VNA (NanoVNA) の画面 (S21 / S11 の Log Mag・Smith・SWR・TDR) | ` ```vna ` | `packages/vna-fence/docs/01-syntax.md` (早見表は無い) | `packages/vna-fence/examples/*.md` |
| オシロスコープの画面 (時間波形・トリガ・カーソル・Measurements) | ` ```scope ` | `packages/scope-fence/docs/02-cheatsheet.md` → `01-syntax.md` | `packages/scope-fence/examples/*.md` |
| スペクトラムアナライザの画面 (tinySA の掃引型・Analog Discovery の FFT 型) | ` ```spectrum ` | `packages/spectrum-fence/docs/02-cheatsheet.md` → `01-syntax.md` | `packages/spectrum-fence/examples/*.md` |
| 教科書の x-y グラフ (共振曲線・ボード線図・I-V などの特性曲線。**計器の画面ではない**) | ` ```graph ` | `packages/graph-fence/docs/02-cheatsheet.md` → `01-syntax.md` | `packages/graph-fence/examples/*.md` |
| ロジックアナライザの画面 (レーン・バス・カーソル・トリガ・UART の読み下し。Analog Discovery の Logic) | ` ```logic ` | `packages/logic-fence/docs/02-cheatsheet.md` → `01-syntax.md` | `packages/logic-fence/examples/*.md` |

**書く前に文法を読む。** 9 つは似ているが同じではない (§4)。
記憶や別のフェンスの感覚で書かない。例の中から近いものを写して直すのが早い。

## 2. 書いたら check

```bash
node <root>/packages/<x>-fence/dist/cli.cjs check <file.md> 2>&1
```

- 見出しとネットリストは標準出力、読めなかった行・お知らせ・ERC は標準エラー
  (9 つとも同じ。計器の画面の 3 つと graph と logic はネットリストの代わりに読み値を標準出力に出す —
  vna と spectrum はマーカー、scope は Measurements とカーソル、graph は mark と peak、
  logic はカーソルの表と、レーンの変わり目の数・バスの値の並び)。
  まとめて読むので `2>&1` を付ける
- 読めなかった行は、行番号・その行・綴りを指す `^` つきで出る。
  1 つでもあれば終了コードは 0 以外
- ネットリスト (どの足がどのネットか) は標準出力。**意図した回路と突き合わせる**
- 計器の画面 (vna・scope・spectrum・logic) と graph は、**読み値を本文の「見るべき値」の表と数で突き合わせ、
  合ってから PNG を 1 度見る**。お知らせ (`time:` が無いので … で描いています、など) は
  既定で埋めた所なので、意図と違えば書き足す
- ERC (つながっていない足、線で跨いだ部品など) は終了コードを変えない。
  **読めない行があるうちは ERC を掛けない**ので、読めない行から直す
- **何も出ずに終了コード 0** は、フェンスが 1 つも見つからなかったということ。
  フェンス名を確かめる (§4)
- `dist/cli.cjs` が無いときは `<root>` で `npm install` → `npm run build -w <x>-fence`。
  文法リファレンスにある書き方が「知らない」と言われたら dist が古いので組み直す

## 3. 図を PNG に焼いて見る

check が通っても、字の重なり・部品の胴の重なり・注釈の置き場所は分からない。
SVG は画像として読めないので PNG に焼いてから見る。
**`render` には必ず `--out` で作業用のディレクトリを渡す** (省くと入力の隣に書き出す)。

```bash
# circuit 以外 (板の 2 つ・copper・計器の画面の vna・scope・spectrum・logic・graph)
node <root>/packages/<x>-fence/dist/cli.cjs render <file.md> --out <tmp>
node <root>/packages/<x>-fence/scripts/png.mjs <tmp>

# circuit (TeX を回すので 1 枚 1 秒ほど。figures.mjs は SVG に地の色を焼き込んでから PNG にする)
node <root>/packages/circuit-fence/dist/cli.cjs render <file.md> --out <tmp>
node <root>/packages/circuit-fence/scripts/figures.mjs <file.md> <tmp>
```

できた `<tmp>/*.png` を画像として読む。見るもの: 題・注釈・ラベルの重なり、
板の外の機器の箱が板や部品に被っていないか、配線が部品の胴を横切っていないか、
手書きや元の回路図と向き・並びが合っているか。**「重なりなし」と報告する前に、
字の 1 つ 1 つが読めるかを見る** (見落としやすい)。

人が読む図なら、流儀 (出典つき) と PNG の点検表は
[electronics-drawing-skills](https://github.com/tommie-jp/electronics-drawing-skills) にある
(回路図・ブレッドボード・ユニバーサル基板・銅張り基板・計器の画面・グラフの 6 つ)。
計器の画面 (vna・scope・spectrum) は **instrument-screen** (logic の流儀はまだ載っていない) — 並べ方ではなく設定の選び方
(尺度・掃引・表示形式・マーカー) の流儀と、**`check` の読み値を本文の表と数で合わせてから**
PNG を見る点検表。グラフは **readable-graph**。circuit フェンスでの番地の間の目安は
[readable-schematic](../readable-schematic/SKILL.md)。

## 4. 取り違えやすい所

| | circuit | breadboard | perfboard |
| --- | --- | --- | --- |
| 番地 | 升目の交点 `a1`。行 `a`〜`cu`、列 `1`〜`99`。升目の宣言は要らない | 穴 `a`〜`j` + 列、レール `+t5` `-b20` | `board:` の穴の中。板の外は `a0` `-a1` (4 つ先まで) |
| `board:` | 無い | `mini` / `half` / `full`。省くと `half` | **要る** (`20x4` は列 × 行、`akizuki-c` など)。**単位の無い数は穴数** — 7×5cm の板を `70x50` と書くと 3,500 穴になる (お知らせが出る)。実寸なら名前か `72x47mm` |
| 印の注釈 | `circle 部品ID か番地` | `circle 部品ID か番地` | **`mark 番地`** (`circle` は無く、部品 ID は指せない) |
| 注釈の種類 | circle box arrow line text source | circle box arrow line text source | mark box arrow text source parts |
| DIP・SIP | 多端子部品 `ID: 種類 番地 [向き] [型番]`。型番が足の名前の表 (cheatsheet「足」の節) にあれば 3 つとも足に名前が出て、名前でも番号でも指せる (`U1.TRIG` = `U1.2`)。表に無い型番は番号のままでお知らせ | 胴の左端の列の穴 1 つ (e でも f でも同じ)。文法表は `dip8 @ e5` (`@` は省いても読む)。足は実物を上から見た並びで **1 番は左下の f 行** | 胴の左上の穴 1 つ。**`dip8 e5`** (`@` を付けると読めない)。**1 番は 3 行下の左下** (e5 なら h5)。DIP に `mirror` は書けない |
| 足に名前のある DIP 型 (`relay` `photocoupler` `seg7`) | 多端子部品と同じ。足は名前でも DIP の番号でも (`K1.COM1` = `K1.4`) | DIP と同じ置き方。**7 セグだけ列の間が 6 穴**で、`@ b5`〜`@ e5` か `@ f5`〜`@ i5` (リレーとフォトカプラは e / f だけ)。1 番は下の列 | DIP と同じ (`relay c3`)。1 番は下の列。板からはみ出すと断られる |
| ERC | `check` だけが掛ける (`render` は掛けない)。DIP・SIP・機器・リレーなどの使わない足は言わない | 無い | `check` と `render` の両方に出る |
| 面実装 | 無い。記号はパッケージに依らず、型番 1 語だけ書ける (`Q1: npn b3 2SC2712`)。**IC のゲートの足の番号は ID の末尾の大文字 (回路) + 型番** (`U1A: nand c3 74HC00` で 1・2 → 3)。**4 本足の 3SK291 は記号が `nmos-dg` (`Q1: nmos-dg d5 3SK291`)、板は変換基板に載せた形を `dip4` (2 列) / `sip4` (1 列) + 型番で (足は `G1` `G2` `D` `S`)**。`npn/sot346` も `2SC2712 S-Mini` も読めない | 変換基板に載せた姿だけ (`transistor/sot346-dip f3 f4 f5`、`dip8/sop @ e5`)。直付けの `transistor/sot346` は書き直し先を添えて断られる | 変換基板 (`-dip`、`dip8/sop b7`) と直付け (`transistor/sot346 d2 d3 c3` は三角、`resistor/2012 f2 f3` は隣の穴)。S-Mini は `sot346` |
| 1 つの穴 | (穴は無い。節点は線の交点・T 字で作ってよい) | **1 つの穴に挿せるのは足か線の端 1 本だけ**。`a12 -- a22 -- g22` とつないで書くと区間ごとの線に開かれ、途中の `a22` に 2 本挿さる。分かれ目は同じ 5 穴の組の別の穴から出す (`a12 -- a22`、`e22 -- f22`、`g22 -- g24`)。直したら check のネットリストが前と同じかで確かめる | breadboard と同じ (全穴が独立なので、つなぐのは配線の線どうしの半田付け) |
| 部品の値の数 | **素の数は Ω と V の種類だけ** (`resistor … 330`、`vsource … 5`)。C・L・水晶・電流源は接頭辞が要る (`47p` / `100u` / `16M` / `1m`。`47` は断られ、値が落ちる)。`47pF` は `47p` と同じ。`100K` は断られる (小文字の `k`) | **素の数は抵抗だけ** (`330` = 330Ω)。C・L は接頭辞が要る (`47p` `100n` `10u` / `100u` `10m`。`47` は断られる)。読めない抵抗値 (`whatever` `10k 1% 2%`、色の無い `10k 3%`) も断られる。0Ω は `0` (黒 1 本) | breadboard と同じ |
| 板の外の機器 | `type: device` + `at: 番地` + `pins: [名前, …]` (**箱の片側に足**。`label` は箱の中の名前、`turn: mirror` で足が右)。1 行では書けない | `type: device` + `at: top` / `bottom` (帯に並ぶ) | `at: top` / `bottom` か番地。**番地は箱の左上**で、板の上なら `-b` 行より上 (`-a` や `0` は箱が板に被り、お知らせが出る) |

copper (銅張り基板) は**位置が穴ではなく mm** で、上の表の書き方はほぼ当てはまらない:

| | copper |
| --- | --- |
| 番地 | **mm の `x,y`** (板の左上から。`20,10`)。小数は 2 桁まで (`0,10.125` は読めない) |
| `board:` | 省くと 40×20mm・h 1.6・εr 4.4・裏ベタで描く (お知らせが出る)。**大きさに単位が要る** (`40x20mm`。`40x20` は断られる)。マップ形式 (`size:` の並び) で `h` `er` `ground` `cut` も書ける |
| 銅 | `copper:` に `L1: line 0,10 40,10 3.06mm` (点を並べて最後に幅)。**縦横だけ**。`pad` `via` `slot` も |
| 単位 | **長さはどこでも `mm` が要る** — 幅 `3.06mm`・溝 `gap 0.3mm`・大きさ `4x4mm`・穴 `0.8mm`・`h: 1.6mm`・`cut: 0.3mm` (`3` `4x4` `h: 1.6` は断られる)。素の数でよいのは番地 (`20,10`、`sma left 10`) と `er: 4.4` だけ。`f:` は接頭辞か Hz (`2.4G`。`2400000000` は断られる) |
| 部品 | 端面 SMA は `sma left 10` (辺と位置。`sma/female` は断られる)、面実装は中心の点 (`capacitor/1608 20,10`)、足のある部品は端 2 つ (島の名前か点) |
| 印の注釈 | `mark 点` (部品名は指せない)。寸法線 `dim 点 点` がある |
| ERC | `check` と `render` の両方に出る。**銅に乗っていない足**が多い — 線路の上に置いた 2 本足のチップは線路を切るので、シャントは `r90` で直角に置く |

vna (VNA の画面) は**板も部品も無い**。位置の代わりに周波数:

| | vna |
| --- | --- |
| 書くもの | `sweep: 1M-300M 101` (開始-終了 点数)、`dut:` (理想の模型。`series R 100` / `shunt C 47p` / `line 50 1m vf 0.66` / 最後に `open` か `short`)、`traces:` (`S21 logmag` のように S11 か S21 と NanoVNA の形式名)、`markers:` (周波数) |
| 値の綴り | R は板と同じ (`4k7`)。**L と C は接頭辞か単位が要る** (`47p` `100n` `1F`。`C 47` も `shunt C 0.1` も断られる。`esl` `cp` も同じ)。長さは単位が要る (`25cm`)。**周波数も接頭辞か `Hz` が要る** (`10M` `900Hz`。`10000000` は断られる。`m` は MHz ではない) |
| 測った値 | `data: <名前>.s2p` は **`.md` と同じ場所のファイルだけ** (`/` `..` は書けない)。CLI は入力の隣を読む。読めない・見つからないはお知らせ (図は理想だけで出る) |
| 部品の Z を見る | 最後に `short` を書いて 1 端子にする。書かないと CH1 の 50 Ω が直列に見える |
| 注釈 | `mark 100M -6dB` / `text 100M -20dB: 字` / `band 88M 108M`。**値の単位で枠が決まる** (dB・deg・ns・Ω・単位なしは SWR) |
| ネットリスト・ERC・マップ | 無い。`check` は読み値の表を出す。お知らせ (機種の範囲の外など) は終了コードを変えない |

scope (オシロの画面) と spectrum (スペクトラムの画面) も**板も部品も無い**。波は同じ綴り
(fence-kit の波) で書き、横軸は scope が時間、spectrum と vna が周波数:

| | scope | spectrum |
| --- | --- | --- |
| 書くもの | `time: 1ms/div`、`trigger: ch1 rising 1V` (`at -5div` で t = 0 を動かす。書き方は早見表)、`ch1:`〜`ch4:` に波と操作 (`ch2: ch1 \| rc 1ms`)、`cursors: [0, 1ms]`、`measure: [vpp, freq]` | **`device:` (必須)** — `ad2` `ad3` (FFT 型) / `tinysa` `tinysa-ultra` `generic` (掃引型)。`sweep: 0-960M 450` か `center:` + `span:`、`signal:` に波、`markers: [100M, peak]` |
| 波 | `sine 1kHz 1V offset 1V phase -58deg`。周波数は `1kHz` でも `1k` でもよい (**素の数 `1000` は断る**)。**周波数が先** | 同じ (`signal: square 100MHz -10dBm`)。周波数は `sweep:` やマーカーと同じ綴りで `100M` でも `100MHz` でもよい |
| 振幅 | **peak**。`2Vpp` と書けば半分、`0.707Vrms` は sine だけ | 同じ。**`-10dBm` は同じ peak の正弦の電力** — 方形波の基本波は 4/π 倍で −7.90 dBm に立つ |
| 取り違え | `phase -58deg` は**遅れ** (正は進み)。`time:` と `range:` は **`/div` 付き** (`time: 1ms` は断る)。コンデンサ入力の平滑は `\| rc` でなく **`\| peak 150ms`** (整流の後ろ) | **`span:` は幅** (`center:` と対。開始-終了は `sweep:`)。型に無いキーは断る (ad2 に `rbw:`、tinysa に `window:`) |
| 通す操作 | `\| rc 1ms` `\| hp 1ms` (微分回路) `\| peak 150ms` `\| lc 1.59kHz 0.7` (2 次の低域。早見表) `\| integrate 1ms` (= (1/τ)∫、結果も V) `\| delay 250us` (0 以上) `\| clip -0.7V 0.7V` `\| offset -1.4V` `\| gain 0.5` `\| abs` `\| invert` | **書けない** (加工した波は scope で描く) |
| 式 | ch の行を `=` で始める: `ch2: = 2V * step(t) * (1 - exp(-t/1ms))`。**数は単位つき** (`1V` `1ms` `1kHz`)、素の数は倍率だけ — `sin(2*pi*1000*t)` は「sin の中は無次元」と断る。ch の式の結果は V (`= 5 * exp(…)` は断る)。並びの形で `,` のある式は引用で囲む (`{wave: "= max(ch1, 0V)"}`) | 無い |
| Math | `math: {expr: ch1 * ch2 / 10, unit: W}` (`=` は付けない)。**unit は書き手が言う** (`V` 既定・`W`・`1`)。書かないと V で出て、式が V^2 ならお知らせ。Avg が有効電力 | 無い |
| XY | `view: xy` + `xy: ch1 ch2` (math も軸に。無ければ ch1 ch2 とお知らせ)。読み値は各軸の Vpp・Vmax・Vmin。**`time:` `trigger:` `cursors:` `measure:` `data:` `notes:` は断る** | 無い |
| 注釈 | `notes:` に `- text ch2 1ms 1.26V: 字` / `- mark 1ms 1.26V` / `- band 0 1ms: 字` / `- source`。番地は**時刻 電圧** (どちらも単位が要る。`1.26` は断る)。**電圧は ch1 の V/div で置く** — ほかの ch の線の上なら ch を書く。`- source` は書き出しで、後ろに出典は書けない (断る) | 無い |
| 読み値 (`check`) | Measurements とカーソルの表 (`CH1  2.00 V  100.0 Hz`) | マーカーの表 (`1  100.000 MHz  −7.90 dBm`) |

**どの計器の画面か**: 加工した波の形 (RC の充電・整流・クリッパ) は scope、信号の中身
(高調波・ノイズフロア・RBW) は spectrum、被測定物 (DUT) の通過・反射の周波数特性
(フィルタの S21・SWR) は vna。vna は周波数・scope は時間。

graph (教科書の x-y グラフ) も**板も部品も無い**が、**計器の画面ではない** — 画面を見せる題は
scope・spectrum・vna、**値を集めて描く題** (共振曲線・ボード線図・I-V・リアクタンス) が graph。

| | graph |
| --- | --- |
| 書くもの | `x: 周波数 Hz log 2k..32k` (名前 単位 [log] [範囲])、`y:` (同じ形。単位ごとに並び)、`lines:` に「名前 単位: 式」か点列 (`- 2k 0.38` を 1 行 1 点)、`data:` (CSV)、`notes:` (`mark` `level` `band` `text` `peak` `source`) |
| 取り違え | **範囲の区切りは `..`** (`2k-32k` は vna の掃引の綴りで、graph では断る)。**線のキーの最後の語が単位** (`電流:` は断る。`電流 mA:`)。**掛け算の `*` は省けない** (`2x` は断る)。**`m` と `M` は別** (1/1000 と 10⁶) |
| 式 | 無次元で、値は線の単位で読む (A で出る式を mA の線に書くなら `* 1000`)。式だけの図は `x:` に範囲が要る |
| 枠 | 単位の違う線は横軸を共有して縦に積んだ枠 (3 つまで)。`level -3dB` `text 16k 27mA: 字` は単位で枠が決まる |
| 実測 | `data:` の CSV は ○ で打ち、**線で結ばない**。列は単位と名前で線に当たる。x は軸の単位に直す (kHz → Hz) |
| 読み値 (`check`) | mark の表 (`1.59 kHz  −3.01 dB  −45.0°`) と peak の表 |

logic (ロジックアナライザの画面) も**板も部品も無い**。scope の ch が電圧の波なのに対し、logic のレーンは 0 / 1。

| | logic |
| --- | --- |
| 書くもの | **`device:` (必須)** — `ad3` (DIO 16 本・125 MS/s) / `generic`。**時間軸は `time: 1s/div` か `window: 10s` のどちらか** (目盛は 10 で固定)。`signals:` に `名前: [dioN] 種類 …` (`clock 1Hz` `pulse 2s 500ms` `pattern 0110 bit 1ms` `high` `low` `edges 0s=0 1s=1` `counter …`)、`buses:` に `名前: A3..A0 hex` (MSB が先・基数は最後)、`cursors: [4.5s, 5.5s]`、`trigger: CLK rising at 0s`、`decode:` (uart) |
| 取り違え | 周波数・時間は**単位が要る** (`1Hz` `500ms`。素の数は断る。`baud` だけ素の整数)。`time:` は **`/div` 付き**。**counter は前に書いたレーンの edge を数え**、`dio1..dio4` の範囲がビット数でレーンは `名前0`〜。`sequence` と `start` / `wrap` は一緒に書けない。**変わり目ちょうどの時刻は新しい値**。**変わり目が 3 px より近いレーンは塗りで描いてお知らせ** (`time:` を細かく)。SPI・I2C は書けない |
| 読み値 (`check`) | カーソルの表 (`Address  0x4  0x5`、ΔX と 1/ΔX) と、レーンごとの変わり目の数・バスの値と時刻の並び (`Address (hex): 0x0@0 s 0x1@1 s …`) |

9 つに共通:

- **フェンス名は `circuit` / `bread` / `perf` / `copper` / `vna` / `scope` / `spectrum` / `graph` / `logic`。** 板の 2 つは長い綴り
  (`breadboard` / `perfboard`) も同じに読む (拡張 0.15.0・breadboard-fence 0.13.0・
  perfboard-fence 0.11.0 から。報告の名札は短い綴り)。新しく書くなら短い綴り。
  **これ以外の綴りは**、プレビューでは灰色のコードブロック、CLI では黙って素通りする
- **`text` の字は `:` の後ろ**: `- text c3 red: ここから電源`。
  番地の後ろに引用で字を書く (`- text c3 "R1: 抵抗"`) と、字の頭が色や向きの語として読まれて通らない。
  字の中にコロンと空白の並びがあるなら、`:` の後ろを囲む (`- text c3: "R1: 抵抗"`)
- circuit と breadboard の向きのある 2 端子は**先に書いた番地が + 側** (アノード)
- 板の 2 つは**部品面**を描く。裏面から描いた手書きを写すときは列を反転する
  (列数 + 1 − 手書きの列)。perfboard は `style: back: on` で裏返した板を下に足せる
- 承知のうえで残す未接続 (抜いたピンなど) は、ERC が言い続けるので本文に理由を書く
- **交差するがつながっていない配線は、なるべく別の色にする** (板の 2 つ。同じ色だと、
  跨ぎの弧があっても、交点でつながって見える)。直し方: 同じネットの線をひとまとめに別の色へ
  (赤は + だけ・黒は GND だけは守り、残りの白・黄・青・橙などから選ぶ)。
  足す前に、線の端点が交点にない組を洗い出して色を見るとよい
- **perf の部品表 (`- parts`) は、抵抗をカラーコードの色の四角、コンデンサを 3 桁の記号
  (`105` など) で出す** (perfboard-fence 0.22.0 から。字の `茶黒橙茶` は出ない)。本文の部品表を
  手で書くときも同じ流儀にする: 抵抗に漢字の色名を書かない、セラミック・フィルムのコンデンサには
  記号 (`100n` → `104`) を添える、セラミックフィルタは種類を `セラミックフィルター` と書く
  (板では `sip3` + `SFU455B`。`ic3` に `455kHz` と書くと表は `ic3` のまま)
- **USB-C の受け口 (`usb-c`、板の 2 つ) は濃い青の変換基板で、足は後ろの縁の四角いパッド**
  (金のランドは描かない)。刷り字は**図の上でいつもパッドの下**に `GND D+ D- V` —
  **配線で指す名前は `VBUS` のまま** (`J1.VBUS`。`V` は刷り字だけ)。下向きならパッドと金物の間、
  上向きなら金物と反対の側に出る。基板の下を通る線は他の部品と同じく
  透かして見える
- **perf では、部品の足へ来る線を胴の上にも重ねて引く** — USB-C のパッド・DIP の変換基板・
  電解コンデンサ・セラミックフィルタなど、胴が足の穴を覆う部品でも**部品面の図で足の真ん中から
  線が出る**のが見える。**線は他の部品の胴の下を通してよい** — くぐる線は胴の上に**透明度 50%** で
  重なり、行き先が追える (足へ来る線は濃いまま)。それでも胴の下を何本も通すと胴が読めなくなるので、
  空いた列があればそちらへ
- **perf の黒い線は白い 1 px の縁取り** (ほかの色は暗い縁)。板の暗い緑の上でも黒い線 (GND) が沈まない

## 5. 返すとき

- どのフェンスで何を描いたか、check の結果 (読めない行 0、ネットリストの要点、
  残した ERC とその理由)、PNG で見て直した所を短く伝える
- PNG と SVG は作業用のディレクトリに置いたままにし、リポジトリには足さない
  (`docs/out` と `examples/out` は `npm run docs` / `npm run examples` が作る)

## 6. GitHub 用の画像 (教科書の本文)

GitHub はフェンスを図にしないので、教科書 (`tommie-circuit-workbook`) は図のフェンスの閉じの直後に、
同じ図の SVG (GitHub Pages) への画像の行を置く。

- **画像の行は `npm run figures` が書く。手で書かない・消さない。** フェンスを足す・動かしたら
  `npm run figures` を回す (`check` が古い行を言う)
- 画像の行は、図のフェンス (9 つと ` ```plantuml `) の直後の、**画像 1 枚だけの段落**。
  間に文を挟むと、次の畳みが効かず、図が 2 枚続けて出る
- **VS Code のプレビューでは、拡張がこの画像を「GitHub 用の画像: …」の閉じた開閉 (トグル) に畳む。**
  フェンスも図になるので、畳まないと同じ図が 2 枚並ぶ。見出しを押すと開き、見比べられる
- 設定 `tommieFence.preview.imageAfterFence` は `collapse` (既定。畳む) / `hide` (消す) / `show` (そのまま)。
  描くたびに読むので、変えても入れ直しは要らない
- ` ```plantuml ` は別の拡張 (jebbs.plantuml) が図にする。PlantUML 拡張は `fence` のトークンを
  `plantuml` に書き換えるので、拡張側は両方を畳む対象にしてある。**ソースを直しても入っている拡張は変わらない**
  — `./doBuild.sh` で作り直して入れ直し、ウィンドウを読み込み直す
- 畳まれない・二重に出るときは、拡張が古い (入れ直していない) か、画像の行がフェンスの直後にない
