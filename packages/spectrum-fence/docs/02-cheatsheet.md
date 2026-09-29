# spectrum フェンス 早見表

**1 画面に収めた全形式。** LLM に書かせるときは、これをそのままプロンプトに貼る。
詳しい説明と図は [01-syntax.md](01-syntax.md)。

## かたち

````text
```spectrum
title: 図01 NanoVNA の出力の高調波   # 任意。図の左上に載る 1 行 (": " を含めない)
device: tinysa-ultra                 # 必須。ad2 ad3 (FFT 型) / tinysa tinysa-ultra generic (掃引型)
sweep: 0-960M 450                    # 開始-終了 [点数]。か center: + span: の対
rbw: 300kHz                          # 掃引型だけ。メニューの値
ref: 0dBm                            # 任意。格子の上端。山が 3 目盛以上下・上で切れると言われる
signal: square 100MHz -10dBm         # 波 (scope と同じ綴り)。並べれば和
markers: [100M, 300M, 500M]          # 周波数か peak。4 つまで
data: 11-4-harmonics.csv             # 任意。.md の隣の 2 列の CSV → 実線
style: dark                          # 任意
```
````

MAX HOLD は `data:` の代わりに `hold:` (下の「MAX HOLD」。`data:` とは一緒に書けない)。
画面は横 10 目盛・縦 10 目盛。理想だけなら**実線**。`data:` を重ねると理想は**破線**、`data:` は**実線**。
`style:` は 1 語 (`light` `dark` `mono`) か並び (`theme` `width` (120〜4000) `stamp` `debug` (`on` / `off`))。

## 機種と、型ごとに書けるキー

| `device:` | 型 | 範囲 | 既定の縦軸 | 点数 / 標本 |
| --- | --- | --- | --- | --- |
| `ad2` | FFT | 0〜25 MHz | dBV、REF 0 dBV | `samples:` 8192 |
| `ad3` | FFT | 0〜50 MHz | dBV、REF 0 dBV | `samples:` 8192 |
| `tinysa` | 掃引 | 0〜960 MHz | dBm、REF −10 dBm | 51 / 101 / 145 / **290** |
| `tinysa-ultra` | 掃引 | 0〜5.3 GHz | dBm、REF −10 dBm | 51 / 101 / 145 / 290 / **450** |
| `generic` | 掃引 | 0〜10 GHz | dBm、REF −10 dBm | 51〜1001 (既定 450) |

| キー | FFT 型 | 掃引型 | 書き方 |
| --- | --- | --- | --- |
| `sweep:` | ○ (点数は書かない) | ○ | `0-20kHz` / `0-960M 450` |
| `center:` `span:` | ○ | ○ | `center: 30MHz` と `span: 2MHz` (**span は幅**) |
| `samples:` | ○ | — | 1024〜65536 の 2 の冪 |
| `window:` | ○ | — | `rect` / `hann` / `flattop` (既定) |
| `points:` | — | ○ | 機種の選択肢 (外れれば丸めて言う) |
| `rbw:` | — | ○ | tinySA `3kHz`〜`600kHz`、Ultra `200Hz`〜`850kHz` のメニューの値、generic は 1 Hz〜10 MHz |
| `atten:` | — | ○ | `20dB` (既定 0) |
| `lna:` | — | ○ (`on` は Ultra だけ) | `on` / `off` |
| `ref:` `scale:` `unit:` | ○ | ○ | `-10dBm` / `10dB` / `dBm` か `dBV` |
| `floor:` | ○ | generic だけ | `-100dBm` (tinySA は DANL で決まるので断る) |
| `signal:` `hold:` `markers:` `data:` | ○ | ○ | 下 |

型に無いキーは断る (「ad2 では rbw: は書けません (分解能は samples: と掃引の幅で決まります …)」)。

## 信号 (`形 周波数 振幅 [offset …] [phase …] [duty …]`)

```yaml
device: tinysa-ultra
sweep: 0-50M 450
rbw: 300kHz
signal:                       # 並べれば和 (16 本まで)
  - sine 10MHz -20dBm         # -10dBm = 50 Ω の正弦の電力 (peak 0.1 V)
  - square 1MHz 30mV          # 振幅は peak。奇数次が 1/n で並ぶ
  - pulse 4MHz 40mVpp duty 10%  # duty を書かなければ 25 % (言われる)
markers: [10M, 1M, 4M]
```

波は `sine` `square` `triangle` `sawtooth` `pulse` `dc` (`dc 0.5V`)。
振幅は `1V` (peak) / `2Vpp` / `0.707Vrms` (sine だけ) / `-10dBm`。`offset 0.5V` は 0 Hz の線になる。
`phase 90deg` は書けるが効かない (画面は電力だけ)。`duty 25%` は square と pulse だけ。
周波数は `100M` でも `100MHz` でもよい (**素の数は断る**)。**操作 (`| rc 1ms`) は書けない** (加工した波は scope)。

## FFT 型

```yaml
device: ad2
sweep: 0-20kHz            # fs = 終わり × 2.56 = 51.2 kHz
samples: 8192             # 分解能 = fs ÷ samples = 6.25 Hz
window: hann
unit: dBm                 # 既定は dBV。dBm にすれば掃引型と同じ数
signal: square 1kHz 1V
markers: [1kHz, 3kHz]
```

## 掃引型

```yaml
device: tinysa-ultra
center: 30MHz
span: 2MHz
points: 101
rbw: 3kHz                 # フロア = −102 dBm + 10 log10(RBW ÷ 30 kHz) + ATT − LNA
atten: 20dB               # フロアだけが上がる (信号の読みは同じ)
ref: -20dBm
signal: sine 30MHz -40dBm
markers:
  - peak
  - 30.5MHz
```

`generic` はフロアを書く: `floor: -90dBm` (書かなければ −100 dBm で描いて言う)。

## MAX HOLD (`hold:`)

```yaml
device: tinysa-ultra
sweep: 70M-110M 450
rbw: 100kHz
signal: sine 88MHz -54.4dBm             # 今の掃引 (任意。書けば 2 本目の色の線)
hold:                                   # 掃引ごとの信号。点ごとの最大が保持したトレースになる
  - sine 74MHz..102MHz -54.4dBm         # from..to は、その波を動かした掃引の全部 (刻みは /2MHz と書ける)
  - sine 2440MHz -50dBm                 # 1 行 = 1 回の掃引 (波は signal: と同じ綴り)
  - [sine 80MHz -60dBm, sine 82MHz -60dBm]   # 1 回の掃引に波が複数 (和)
markers: [74M, 102M]                    # マーカーは保持したトレースを読む (「読み値 — MAX HOLD (計算)」)
```

刻みを書かなければ掃引の点ごとに置く。FFT 型 (`ad2` `ad3`) は刻みを書く (`1kHz..9kHz/2kHz`)。
積める掃引は掃引型 1000・FFT 型 32。**`data:` とは一緒に書けない。**

## マーカーと読み値の見方

マーカーは周波数 (`100M` `30.5MHz` `0`) か `peak`。周波数は一番近い点に吸い付き、`peak` は一番高い点。

```text
  読み値 — 理想 (計算)            ← data: があれば「実測 (11-12-fm.csv)」。マーカーは実測の点を読む
  M  周波数       レベル
  1  100.000 MHz  −7.90 dBm       ← 周波数は小数 3 桁、レベルは小数 2 桁。負の印は −
  2  300.000 MHz  −17.44 dBm
```

見るべき値の検算: 方形波の n 次は 1/n (基本波は peak の 4/π 倍)。`-10dBm` の方形波は
1 次 −7.90、3 次 −17.44、5 次 −21.88 dBm。1 V peak の正弦は −3.01 dBV = +10.00 dBm。

## 取り違えやすい書き方

| 書いた | どうなる | 正しくは |
| --- | --- | --- |
| `device:` を省く | 断る (既定が無い) | `device: tinysa-ultra` など |
| `span: 90M-110M` | 断る (span は幅。`center:` と対) | `sweep: 90M-110M` か `center: 100MHz` と `span: 20MHz` |
| `signal: sine 1000 1` | 断る (単位が無い) | `sine 1kHz 1V` |
| `square 100MHz -10dBm` を「基本波 −10 dBm」のつもり | 基本波は **−7.90 dBm** (`-10dBm` は同じ peak の正弦の電力) | 基本波を −10 dBm にしたいなら `sine` で書く |
| `signal: square 1MHz -10dBm \| rc 1us` | 断る (操作は scope) | scope で描く |
| `device: ad2` に `rbw:` `points:` `atten:` | 断る (型に無い) | `samples:` `window:` |
| `device: tinysa` に `samples:` `window:` `floor:` | 断る | `points:` `rbw:` |
| `sweep: 0-20kHz 450` を ad2 で | 断る (FFT 型に点数は無い) | `sweep: 0-20kHz` + `samples: 8192` |
| `rbw: 250kHz` (メニューに無い) | 断る (選べる値を並べて言う) | `rbw: 300kHz` |
| `ref: -10` / `atten: 10` | 断る | `ref: -10dBm` / `atten: 10dB` |
| `samples: 8000` | 断る (2 の冪) | `samples: 8192` |
| `window: blackman` | 断る | `rect` / `hann` / `flattop` |
| `lna: on` を tinysa で | 断る (LNA は Ultra だけ) | `device: tinysa-ultra` |
| `sine 74M..102M` を `signal:` に書く | 断る (範囲は `hold:` の中だけ) | `hold: sine 74M..102M -54dBm` |
| `hold:` と `data:` を一緒に | 断る (`hold:` を外す) | どちらか |
| `notes:`、マーカーの `delta` `noise`、`span: 0` | 断る (まだ書けない) | — |

## scope・vna との違い

| | spectrum | scope | vna |
| --- | --- | --- | --- |
| 横軸 | **周波数** (`sweep:` / `center:` + `span:`) | 時間 (`time: 1ms/div`) | 周波数 (`sweep: 1M-300M 101`) |
| 書くもの | 信号 (`signal:`) と計器の設定 | 発生器の波 + 操作 (`ch1 \| rc 1ms`) | 被測定物の模型 (`dut:`) |
| `device:` | **必須** | 無い | 任意 (既定 `h4`) |
| 縦軸 | dBm / dBV (電力のスペクトル) | V (電圧の時間波形) | dB・Ω・SWR (S パラメータ) |
| `data:` | tinySA / WaveForms の 2 列の CSV | WaveForms の Scope の CSV | Touchstone (`.s2p`) |

**信号の中身 (高調波・フロア・RBW) を見るのが spectrum。** 加工した波の形は scope、
被測定物 (DUT) の通過・反射の周波数特性 (フィルタの S21) は vna。

## 直し方

読めなかった行は、行番号・行の中身・綴りの下の印つきで返る。

```text
spectrum: 4 行目: 周波数は 1kHz / 100MHz / 960M のように単位か接頭辞を付けます
    signal: sine 100000000 -10dBm
                 ^^^^^^^^^
```

`spectrum-fence check <ファイル>` で図を書かずに読み値と言うことだけ出せる
(読めない行があれば終了コードは 1)。
