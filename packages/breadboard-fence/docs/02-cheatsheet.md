# breadboard フェンス 早見表

**1 画面に収めた全形式。** LLM に書かせるときは、これをそのままプロンプトに貼る。
詳しい説明と図は [01-syntax.md](01-syntax.md)。

## かたち

````text
```breadboard
title: 図01 …          # 任意。図の左上に載る 1 行
points:                # 任意。番地に名前を付ける
  vin: a5
board: half            # mini (17 列) / half (30 列、既定) / full (63 列)
style: dark            # テーマ名か、下の表のマップ
parts-list: below      # below (既定) / none
parts:                 # ID: 種類 番地 … [値 か l=ラベル]
  R1: resistor a5 a10 10k
wires:                 # - 端点 -- 端点 [-- 端点 …] [色] [迂回ヒント]
  - +t5 -- a5 red
notes:                 # 任意。図に重ねる印と字
  - circle R1
```
````

## 番地

| 形 | 意味 |
| --- | --- |
| `a5` … `j30` | 穴。行 `a`〜`e` が上ブロック、`f`〜`j` が下ブロック。大小どちらでも可 |
| `+t5` `-t5` `-b5` `+b5` | レール。極性 + 上下 + 列 |
| `U1.7` `AD2.V+` | ピン参照 (配線の端点にだけ書ける) |
| `vin` | `points:` で付けた名前 |

**同じ列の穴は導通している** (a5〜e5 が 1 つのネット、f5〜j5 が別のネット)。

## 部品

| 形 | 書き方 | 例 |
| --- | --- | --- |
| 2 本足 | `ID: 種類 穴 穴 [値]` | `R1: resistor a5 a10 10k` |
| 3 本足 | `ID: 種類 穴 穴 穴 [値]` | `Q1: transistor h9(B) h10(C) h11(E) 2SC1815` |
| タクトスイッチ | `ID: button @ 穴` | `SW1: button @ e5` |
| DIP / ヘッダ | `ID: dipN @ 穴 [r180] [ラベル]` | `U1: dip8 @ e5 NJM4556A` |
| マイコンボード | `ID: 種類 @ 穴 [r180]` | `MCU: pico2 @ h5` |
| ボード外の機器 | マップ形式 (下記) | |

穴にピン名を付けるときは `a5(A)`。付けなければ左から `1` `2` `3`。

**向きの語 `r180` はアンカー 1 つで置く形だけ**に書ける (1 番ピンが反対の端へ移る)。
足を並べて書く部品の向きは穴の順そのもの。`r90` / `r270` は溝をまたぐので書けず、
裏返しは `@ f5` のようにアンカーの行で書く。

### 種類

```text
2 本足   resistor capacitor led diode buzzer crystal inductor
         photoresistor thermistor thermistor-ntc thermistor-ptc varistor
         zener schottky photodiode varicap diac reed fuse lamp sma
         speaker mic battery solar switch switch-nc
3 本足   transistor potentiometer slide-switch thyristor triac regulator
まとまり  button button-nc dipN (4〜40 の偶数) sipN (2〜40)
ボード    pico pico-w pico2 pico2-w
ボード外  device
```

### 姿 (`種類/姿`)

```text
capacitor/ceramic  capacitor/film  capacitor/electrolytic  capacitor/tantalum
led/3mm  led/5mm
transistor/to92  transistor/to220  transistor/sot23-dip  thyristor/…  triac/…  regulator/…
sma/male  sma/female
crystal/hc49  crystal/cylinder
resistor/quarter  resistor/half        diode/do35  diode/do41  (zener/…  schottky/…)
inductor/axial  inductor/radial        potentiometer/trimmer  potentiometer/knob
```

### 略記 (読んだ直後に正式名へ畳む)

```text
r=resistor  c=capacitor  l=inductor  d=diode  ec=ecap=capacitor/electrolytic
pot=potentiometer  ldr=photoresistor  ntc=thermistor-ntc  ptc=thermistor-ptc
xtal=crystal  scr=thyristor  btn=pushbutton=button
```

### ボード外の機器 (マップ形式)

```yaml
parts:
  AD2:
    type: device
    at: top            # top (既定) / bottom
    label: Analog Discovery 2
    pins: [W1, GND]
```

マップ形式で書けるキーは `type` `at` `label` `value` `pins` `holes` の 6 つ。

## 配線

```yaml
wires:
  - +t5 -- a5 red                # 端点 2 つ
  - b10 -- b14 -- b21 orange     # つないで書く (区間ごとに開かれる)
  - j20 -- -b20 black [v-20]     # 迂回ヒント。20 が穴 1 つぶん
```

色: `red black white gray` (`grey` も可) `orange yellow green blue purple brown pink`

端点が部品の足と同じ穴なら、部品のほうが同じ列の空いた行へ寄って描かれる
(実物では同じ穴に挿せないため。ピン参照 `U1.7` では寄らない)。

## 注釈

```yaml
notes:
  - circle R1                    # 指し先を囲む楕円
  - box a5 e12 blue solid        # 枠 (既定は破線)
  - arrow d22 R1                 # 指し棒
  - line +t20 -t20 green         # 直線
  - text d24 large bold: 電流を決めるのはここ
  - source tiny                  # フェンスそのものを書き出す (板の下の帯へ)
  - text: 仮組み。あとで直す       # 番地を書かなければ板の下
```

語 (順不同): 色 `red blue green orange ink` / 大きさ `tiny small normal large huge` /
寄せ `left center right` / `bold` / `solid` (box) / 行送り `tight loose` (source)

**`text` と `source` は番地を書かなければ板の下の帯に置く** (`below` が既定)。
`- source below tiny` と書き出しても同じ。場所を書けるのはこの 2 つだけ。

## 見た目

```yaml
style:
  theme: dark          # classic dark high-contrast mono presentation (既定)
  text-size: 13        # 6〜24
  text-color: "#e2e8f0"
  text-background: "#2b3038"
  wire-width: 5        # 1〜8
  board-color: "#2b3038"
  hole-size: 6         # 2〜14
  hole-color: "#0d1014"
  width: 1200          # 120〜4000
  debug: on            # on (既定) / off。お知らせを出すか
  stamp: off           # on / off (既定)。右下に版を刻むか
```

## 落とし穴

- **色は `"…"` で囲む。** `text-color: #333` は `#` から先が YAML のコメントになり、
  値が空で届く。
- **`text` の字は `:` の後ろ。** `- text a5 "R1: …"` は黙ってマップとして読まれる。
- **部品の値に番地の形の語は使えない** (`J5` など)。番地として読まれる。
  `330` `10k` のような値は番地の形にならないので安全。ただし
  **`points:` に付けた名前も穴として読まれる**ので、`10k` `red` `2N3904` のような
  値に使う語を点の名前にしない (黙って別の穴に置かれることがある)。
- **極性・向きのある 2 端子は、先に書いた穴が + 側 (アノード)。**
  書かなくても向きは決まる。
- **タクトスイッチは同じ側の 2 本が押す前からつながっている。**
  `e5` と `e7` を回路の両端に使うと最初から短絡している。
- **`board: full` は 63 列。** half (30 列) のつもりで 40 列に置くとはみ出す。
- **`board: mini` (17 列) にはレールが無い。** `+t5` のようなレール番地はエラーになる。
  付けたいときは `rails: "+--+"` と書く (逆に `rails: none` でどのサイズからも外せる)。
- 迂回ヒントを書く行は端点を 2 つだけにする。
- **値と `l=` の両方は書けない** (図に出るのは値)。
- 点の名前に**番地の形・レール名 (`-t`)・ハイフンだけの語・`below`** は使えない。

## 直し方

読めなかった行は、行番号・行の中身・綴りの下の印つきで返る。

```text
breadboard: 2 行目: 知らない部品の種類です: resistr (resistor のことですか?)
      R1: resistr a5 a10 10k
          ^^^^^^^
```

`breadboard-fence check <ファイル>` で、図を書かずに検証とネットリストだけ出せる
(読めない行があれば終了コードは 1)。
