# scope フェンス 早見表

**1 画面に収めた全形式。** LLM に書かせるときは、これをそのままプロンプトに貼る。
詳しい説明と図は [01-syntax.md](01-syntax.md)。

## かたち

````text
```scope
title: 図01 RC の充電        # 任意。図の左上に載る 1 行
view: time                 # 任意。time (既定) か xy
time: 1ms/div              # 横 1 目盛。/div が要る。無ければ一番遅い波の 2 周期
trigger: ch1 rising 1V     # ch 向き [水準]。無ければ ch1 の立ち上がり・中央
ch1: square 100Hz 1V offset 1V
ch2: ch1 | rc 1ms          # 前の ch を操作に通す
math: {expr: ch1 * ch2 / 10, unit: W}   # 任意。5 本目 (Math)。単位は書き手が言う
data: 5-1-rc.csv           # 任意。.md の隣の WaveForms の CSV → 実線
cursors: [0, 1ms]          # 任意。X1 X2
measure: [vpp, freq]       # 任意。無ければ vpp と freq
style: dark                # 任意
```
````

画面は横 10 目盛・縦 8 目盛、t = 0 (トリガ) が真ん中。理想は**破線**、`data:` は**実線**。

`style:` は 1 語 (`light` `dark` `mono`) か並び (`theme` `width` (120〜4000) `stamp` `debug` (`on` / `off`))。

## 波 (`形 周波数 振幅 [offset …] [phase …] [duty …]`)

```yaml
ch1: sine 1kHz 1V                        # 振幅は peak
ch2: square 100Hz 1V offset 1V           # 0〜2 V の方形波
ch3: triangle 1kHz 2Vpp phase -58deg     # 2Vpp = peak 1 V。phase の負は遅れ
ch4: pulse 1kHz 2.5V offset 2.5V duty 20%
```

| 形 | 例 | メモ |
| --- | --- | --- |
| `sine` | `sine 1kHz 0.707Vrms` | Vrms は sine だけ |
| `square` | `square 100Hz 1V duty 25%` | t = 0 で立ち上がる |
| `triangle` | `triangle 1kHz 1V` | t = 0 で底 |
| `sawtooth` | `sawtooth 1kHz 1V` | t = 0 で底 |
| `pulse` | `pulse 1kHz 1V duty 20%` | duty を書かなければ 25 % (言われる) |
| `dc` | `dc 3.3V` | 値だけ。周波数も offset も書かない |

- 周波数は `1kHz` でも `1k` でもよい (`100Hz` `2.5MHz` `2.5M`。**素の数は断る**)。**周波数が先、振幅が後**
- 振幅: `1V` (peak) / `2Vpp` / `0.707Vrms` (sine だけ) / `-10dBm` (50 Ω の正弦の電力 → peak 0.1 V)
- `offset 1V` `phase 90deg` (`90°` も) `duty 25%` (square と pulse だけ) は順不同

## 操作 (`| 操作`、書いた順に、8 つまで)

```yaml
ch1: sine 100Hz 5V
ch2: ch1 | clip -0.7V 0.7V                  # 両側を頭打ち
ch3: ch1 | abs | offset -1.4V | clip 0V     # 全波整流 − 1.4 V、下だけ切る
ch4: ch3 | rc 20ms | gain 0.5               # 平滑 (τ) と倍率
```

`rc 1ms` (τ) / `peak 150ms` (山で充電して τ で放電 = コンデンサ入力) / `clip -0.7V 0.7V` / `clip 0V` (下だけ) /
`offset -1.4V` / `gain 0.5` (単位なし) / `abs`

参照できるのは**自分より前の ch だけ**。`rc` と `peak` は 10 τ ぶん助走してから画面に入る (定常)。

```yaml
ch1: sine 50Hz 5V
ch2: ch1 | abs | offset -1.2V | clip 0V | peak 150ms   # 全波整流 + 100 µF・1.5 kΩ の平滑
```

## 式 (`= …`)

ch の行は `=` で始めれば式。`math:` はいつも式 (`=` は付けない)。

```yaml
ch1: = 2V * step(t) * (1 - exp(-t/1ms))       # RC の充電 (t = 0 の段から)
ch2: = 1V * sin(2 * pi * 1kHz * t) | rc 1ms   # 式の後ろにも操作を繋げる
ch3: {wave: = 1.4uV * (exp(ch1 / 52mV) - 1), range: 200mV/div}
```

- 数は**単位つき**: `1V` `500mV` `1ms` `20us` `1kHz`。**素の数は無次元の倍率だけ** (`2 * pi`、`/ 10`)
- 名前: `t` (s) `pi` `ch1`〜`ch4` (前の ch だけ)。関数: `sin` `cos` `exp` `abs` `sqrt` `min` `max` `clip(x, lo, hi)` `step(x)` (x ≥ 0 で 1)
- 演算: `+ - * / ^` と括弧。`^` > 単項の `-` > `* /` > `+ -` (`-2^2` は −4)
- **単位を数える**: `sin` `cos` `exp` の中は無次元、`+ - min max clip` の両側は同じ単位、ch の式の結果は V。
  合わなければ断る (`sin(2*pi*1000*t)` は「sin の中は無次元」)
- 並びの形 (`{wave: …}` `{expr: …}`) で式に `,` があれば**引用で囲む** (`{wave: "= max(ch1, 0V)"}`)。囲まないと YAML の区切りに読まれる (言われる)
- 計算できない点 (0 で割る・負の平方根) は 0 で、±1 MV を越える点は ±1 MV で描いてお知らせ。200 字・入れ子 16 段まで

## Math (`math:`)

```yaml
ch1: sine 1kHz 1V
ch2: sine 1kHz 1V phase -60deg
math: {expr: ch1 * ch2, unit: W, range: 200mW/div, position: -2div}
measure: [avg, vpp]
```

- 並びに書けるのは `expr` `unit` `range` `position`。1 行 (`math: ch1 - ch2`) なら unit は V
- `unit:` は `V` `W` `1` (無次元)。**道具は単位を推定しない** — 式の次元 (`ch1 * ch2` は V^2) と合わなければお知らせ
- `range:` は unit の単位で (`200mW/div`、`0.5/div`)。色は 5 本目、基準の印は `M`
- Measurements・カーソルの表に `MATH` の行が unit の単位で出る (`Avg 250 mW`)。`data:` があっても Math は理想

## XY (`view: xy`)

```yaml
title: リサージュ 1:2
view: xy
ch1: sine 2kHz 1V
ch2: sine 1kHz 1V
xy: ch1 ch2                # 横 縦。math も軸にできる。無ければ ch1 ch2 (言われる)
```

- 格子は 8 × 8。軸ごとに Auto の 1-2-5 (ch の `range:` `position:` を書けばそれ)
- 読み値は各軸の `Vpp` `Vmax` `Vmin` (V–I の曲線は端の値を読む)
- 標本化するのは周波数の揃う最短の時間 (1 kHz と 1.5 kHz なら 2 ms)。曲線はちょうど 1 周する
- `time:` `trigger:` `cursors:` `measure:` `data:` は書けない (断る)

## V/div と基準 (書かなければ Auto)

```yaml
ch1: {wave: square 500Hz 2.5V offset 2.5V, range: 2V/div, position: -3div}
```

並びに書けるのは `wave` `range` (`/div` が要る) `position` (`-3div`。中央 0、上が正) の 3 つ。
手で書いた尺度で振れが 2 目盛未満か、画面からはみ出すと、直す `range:` `position:` の値つきでお知らせが出る。
同じ尺度で重ねて比べる ch (同じ `range:` と `position:` で、振れの大きい相手がいる) の小ささには言わない。

## トリガ・カーソル・Measurements

```yaml
time: 200us/div            # 1ms/div  200µs/div  1s/div  (1 ns/div〜60 s/div)
trigger: ch2 falling       # 向きは rising / falling。水準を省けば波形の中央
ch1: sine 1kHz 1V
ch2: ch1 | rc 1ms
cursors: [0, 500us]        # 2 本まで。0 以外は単位が要る。負も書ける
measure: [vpp, vmax, vmin, avg, rms, freq, period, duty]
```

`measure:` に書ける名前 (8 つまで): `vpp` `vmax` `vmin` `avg` `rms` `freq` `period` `duty` `phase` `rise`。
`phase` は**一番上の ch に対する遅れ** (負が遅れ)、`rise` は 10〜90 %。

## 読み値の見方

`check` (と図の下の帯) が出す表。**図を見る前にこの数を本文の表と突き合わせる。**

```text
  読み値 — 理想 (計算)                 ← data: の列があれば「実測 (5-1-rc.csv)」
  CH   Vpp     Freq
  CH1  2.00 V  100.0 Hz                ← 電圧は有効 3 桁、時間と周波数は 4 桁
  CH2  1.97 V  100.0 Hz
      t                     CH1     CH2
  X1  0 s                   1.00 V  14.0 mV
  X2  1.000 ms              2.00 V  1.27 V
  ΔX  1.000 ms (1.000 kHz)  1.00 V  1.26 V   ← X2 − X1 (時間差と 1/ΔX、電圧の差)
```

測れない値は `—` (1 周期に満たない Freq、基準の ch 自身の Phase)。

## 取り違えやすい書き方

| 書いた | どうなる | 正しくは |
| --- | --- | --- |
| `sine 1000 1` | 断る (単位が無い) | `sine 1kHz 1V` |
| `sine 1V 1kHz` | 断る (順が逆) | `sine 1kHz 1V` |
| `sine 1kHz 2V` のつもりで p-p | **peak 2 V (Vpp 4 V)** に描く | `sine 1kHz 2Vpp` か `sine 1kHz 1V` |
| `square 1kHz 0.707Vrms` | 断る (Vrms は sine だけ) | `square 1kHz 1V` |
| `phase 58deg` のつもりで遅れ | **進み**に描く | `phase -58deg` |
| `time: 1ms` | 断る (`/div` が無い) | `time: 1ms/div` |
| `range: 500mV` | 断る (`/div` が無い) | `range: 500mV/div` |
| 小さく振れる ch だけに `range:` を書く (同じ尺度の相手がいない) | お知らせ (2 目盛未満) | その ch は Auto か、お知らせの値 |
| `trigger: ch1 up` / `ch1 rising 0.5` | 断る | `ch1 rising` / `ch1 rising 500mV` |
| `offset 1` / `gain 2dB` | 断る | `offset 1V` / `gain 2` |
| `ch1: ch2 \| rc 1ms` | 断る (後ろの ch) | 並びを入れ替える |
| `measure: [frequency]` | 断る | `freq` |
| `ch2: = 5 * exp(-t/1ms)` | 断る (結果が V でない) | `ch2: = 5V * exp(-t/1ms)` |
| `= 1V * sin(2*pi*1000*t)` | 断る (sin の中に s が残る) | `sin(2 * pi * 1kHz * t)` |
| `= 1V * sin 1kHz` / `= 1 V` | 断る | `sin(…)` と括弧、`1V` と続けて |
| `= max(ch1, 0)` | 断る (V と無次元) | `max(ch1, 0V)` |
| `{wave: = max(ch1, 0V)}` | 断る (`,` が YAML の区切り) | `{wave: "= max(ch1, 0V)"}` |
| `math: ch1 * ch2` で電力 | **V** で出る (お知らせ: 式は V^2) | `math: {expr: ch1 * ch2, unit: W}` |
| `math: = ch1 * 2` / `math: sine 1kHz 1V` | 断る | `math: ch1 * 2` (波は ch の行) |
| `view: xy` と `time:` `trigger:` `cursors:` | 断る (XY に時間軸は無い) | 書かない |
| `ch2: ch1 \| rc 150ms` でコンデンサ入力の平滑 | 形が違う (1 次の低域) | `\| peak 150ms` (整流の後ろに) |
| `notes:` | 断る (まだ書けない) | — |

## vna・spectrum との違い

| | scope | spectrum | vna |
| --- | --- | --- | --- |
| 横軸 | **時間** (`time: 1ms/div`) | 周波数 (`sweep: 0-960M 450`) | 周波数 (`sweep: 1M-300M 101`) |
| 書くもの | 発生器の波 + 操作 (`ch1 \| rc 1ms`) | 信号 (`signal:`、操作は書けない) | 被測定物の模型 (`dut:`) |
| 振幅 | peak (`1V` `2Vpp` `-10dBm`) | 同じ綴り (`-10dBm` は正弦の電力) | — (S パラメータ) |
| `device:` | 無い | **必須** | 任意 (既定 `h4`) |
| `data:` | WaveForms の Scope の CSV | tinySA / WaveForms の 2 列の CSV | Touchstone (`.s2p`) |

**加工した波 (RC・整流・クリッパ) は scope。** 同じ波の高調波の高さは spectrum、
被測定物の通過・反射の周波数特性 (フィルタの S21) は vna。

## 直し方

読めなかった行は、行番号・行の中身・綴りの下の印つきで返る。

```text
scope: 3 行目: 周波数は 1kHz / 100MHz / 960M のように単位か接頭辞を付けます
    ch1: sine 1000 1V
              ^^^^
```

`scope-fence check <ファイル>` で図を書かずに読み値と言うことだけ出せる
(読めない行があれば終了コードは 1)。
