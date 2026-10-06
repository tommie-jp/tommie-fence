# bread フェンス 早見表

**1 画面に収めた全形式。** LLM に書かせるときは、これをそのままプロンプトに貼る。
詳しい説明と図は [01-syntax.md](01-syntax.md)。

## かたち

````text
```bread
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
| 2 ピン | `ID: 種類 穴 穴 [値]` | `R1: resistor a5 a10 10k` |
| 3 ピン | `ID: 種類 穴 穴 穴 [値]` | `Q1: transistor h9(B) h10(C) h11(E) 2SC1815` |
| タクトスイッチ | `ID: button @ 穴` | `SW1: button @ e5` |
| DIP / ヘッダ | `ID: dipN @ 穴 [r180] [型番]` | `U1: dip8 @ e5 NE555` |
| 幅広 DIP (0.6 インチ) | `ID: dipN/wide @ 穴 [r180] [型番]` | `U1: dip28/wide @ d10 62256` |
| マイコンボード | `ID: 種類 @ 穴 [r180]` | `MCU: pico2 @ h5` |
| 名前つきの DIP 型 | `ID: 種類 @ 穴 [r180]` | `K1: relay @ f10` |
| ボード外の機器 | マップ形式 (下記) | |

穴にピン名を付けるときは `a5(A)`。付けなければ左から `1` `2` `3`。

**向きの語 `r180` はアンカー 1 つで置く形だけ**に書ける (1 番ピンが反対の端へ移る)。
ピンを並べて書く部品の向きは穴の順そのもの。`r90` / `r270` は溝をまたぐので書けず、
DIP・マイコンボードは実物を上から見た並び (切り欠きを左にして 1 番が左下)。
アンカーは胴の左端の列で、溝の上下どちらの行に書いても同じ。裏返し (`mirror`) は無い。

**幅広 DIP (`dipN/wide`、24・28・32・40 ピン) はピンの行が 6 ピッチ (0.6 インチ) 離れる。**
行の組は b↔f・c↔g・d↔h・e↔i (おすすめは d↔h)。胴はピンの行のあいだを覆い、
d↔h なら e・f・g 行が胴の下。空くのは d の上の a〜c と h の下の i・j。
`dip16/wide` のようにほかの大きさは書けない。

### 種類

```text
2 ピン   resistor capacitor led diode buzzer crystal inductor
         photoresistor thermistor thermistor-ntc thermistor-ptc varistor
         zener schottky photodiode phototransistor varicap diac reed fuse lamp ferrite-bead sma
         speaker mic battery solar switch switch-nc
3 ピン   transistor potentiometer slide-switch thyristor triac regulator ic3
4 ピン   transformer
USB      usb-a (穴は VBUS GND D+ D- の順に 2 つから) usb-c (穴は GND D+ D- VBUS の順に 4 つ)
まとまり  button button-nc dipN (4〜40 の偶数) sipN (2〜40)
ボード    pico pico-w pico2 pico2-w tang-nano-9k (FPGA。列の間が 9 ピッチ: a↔h b↔i c↔j)
名前つき  relay photocoupler photocoupler6 seg7 dip-switch4 dip-switch8 (DIP 型。ピンは名前でも番号でも。K1.COM1 = K1.4)
ボード外  device
```

### 姿 (`種類/姿`)

```text
capacitor/ceramic  capacitor/film  capacitor/electrolytic  capacitor/tantalum
led/3mm  led/5mm  phototransistor/3mm  phototransistor/5mm
transistor/to92  transistor/to220  thyristor/…  triac/…  regulator/…  ic3/…
transistor/sot23-dip  transistor/sot346-dip (S-Mini)  transistor/sot89-dip  (regulator/…)
dip8/sop  dip8/tssop  (dipN の姿。DIP 化した変換基板)
dip24/wide  dip28/wide  dip32/wide  dip40/wide  (600 mil 幅。ピンの行は d↔h など 6 ピッチ離れた組。下記)
relay/g5v-2  photocoupler/pc817  photocoupler6/4n35  seg7/5161as  (品名。書かなければこれ)
sma/male  sma/female  usb-a/male  usb-a/female  usb-c/male  usb-c/female
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

`label` は機種名 (`Analog Discovery 2` / `Analog Discovery 3` など)。AD3 の例は
`examples/10-bh-ad3.md` (`pins: [V+, V-, GND, W1, 1+, 1-, 2+, 2-]`、AD2 の `10-bh-ad2.md` と同じ回路)。

マップ形式で書けるキーは `type` `at` `label` `value` `pins` `holes` の 6 つ。

### DIP のピンの名前

型番 (`U1: dip8 @ e5 NE555`) が下の表にあれば、胴に番号 (縁) と名前 (胴の外、ピンの向こう側) が出る。
型番の綴りは完全一致 (大文字小文字は問わない)。配線は名前でも番号でも指せ (`U1.TRIG` = `U1.2`)、
ネットリストは名前。2 本以上に刷られた名前 (`NC` `GROUND`) は番号で呼ぶ。表に無い型番は番号だけで、お知らせが出る。

| 型番 (別名) | 種類 | ピンの名前 (1 番から) |
| --- | --- | --- |
| `NE555` (`NE555P` `SA555` `SE555` …) | `dip8` | `GND` `TRIG` `OUT` `RESET` `CONT` `THRES` `DISCH` `VCC` |
| `TLC555` (`TLC555CP` `TLC555IP`) | `dip8` | `GND` `TRIG` `OUT` `RESET` `CONT` `THRES` `DISCH` `VDD` |
| `LM358` (`LM358P` `LM358N` `LM2904` `LM258` …) | `dip8` | `OUT1` `IN1-` `IN1+` `V-` `IN2+` `IN2-` `OUT2` `V+` |
| `TL071` (`TL071CP` …) | `dip8` | `NC` `IN-` `IN+` `VCC-` `NC` `OUT` `VCC+` `NC` |
| `TL072` (`TL072CP` `TL082` …) | `dip8` | `1OUT` `1IN-` `1IN+` `VCC-` `2IN+` `2IN-` `2OUT` `VCC+` |
| `LM393` (`LM393P` `LM393N` `LM393A` `LM2903` `LM293` …) | `dip8` | `1OUT` `1IN-` `1IN+` `GND` `2IN+` `2IN-` `2OUT` `VCC` |
| `NE5532` (`NE5532P` `NE5532AP` `SA5532` …) | `dip8` | `1OUT` `1IN-` `1IN+` `VCC-` `2IN+` `2IN-` `2OUT` `VCC+` |
| `LM324` (`LM324N` `LM324AN` `LM2902` …) | `dip14` | `1OUT` `1IN-` `1IN+` `VCC+` `2IN+` `2IN-` `2OUT` `3OUT` `3IN-` `3IN+` `VCC-` `4IN+` `4IN-` `4OUT` |
| `LM741` (`LM741CN` `LM741N` `UA741` …) | `dip8` | `OFFSET1` `IN-` `IN+` `V-` `OFFSET2` `OUT` `V+` `NC` (1・5 番はオフセット調整。8 番は NC) |
| `ATtiny85` (`ATtiny85-20PU` `ATtiny45` `ATtiny25`) | `dip8` | `PB5` `PB3` `PB4` `GND` `PB0` `PB1` `PB2` `VCC` (1 番 `PB5` は RESET 兼用。PB0=MOSI/SDA、PB1=MISO、PB2=SCK/SCL、PB3=XTAL1、PB4=XTAL2) |
| `ATmega328P` (`ATmega328P-PU` `ATmega328` `ATmega168` …) | `dip28` | `PC6` `PD0` `PD1` `PD2` `PD3` `PD4` `VCC` `GND` `PB6` `PB7` `PD5` `PD6` `PD7` `PB0` `PB1` `PB2` `PB3` `PB4` `PB5` `AVCC` `AREF` `GND` `PC0` `PC1` `PC2` `PC3` `PC4` `PC5` (1 番 `PC6` は RESET 兼用。8 番と 22 番は GND (番号で指す)。PB6・PB7 は水晶 (XTAL1・XTAL2)) |
| `SA612` (`SA612A` `NE612` `NE602` …) | `dip8` | `IN_A` `IN_B` `GND` `OUT_A` `OUT_B` `OSC_B` `OSC_E` `VCC` (`IN_A` `IN_B` が RF の入力、`OSC_B` が発振のベース (外の LO の入口)、`OSC_E` が発振のエミッタ) |
| `MCP6002` (`MCP6002-I/P` `MCP6002-E/P` `MCP6002-I/SN` …) | `dip8` | `VOUTA` `VINA-` `VINA+` `VSS` `VINB+` `VINB-` `VOUTB` `VDD` |
| `LM386` (`LM386N-1` `LM386N-3` `LM386N-4` …) | `dip8` | `GAIN1` `-INPUT` `+INPUT` `GND` `VOUT` `VS` `BYPASS` `GAIN8` (印字は 1・8 番とも `GAIN` (番号を付けて分けた)。`BYPASS` は C で GND へ) |
| `CD4017B` (`CD4017` `CD4017BE`) | `dip16` | `Q5` `Q1` `Q0` `Q2` `Q6` `Q7` `Q3` `VSS` `Q8` `Q4` `Q9` `CO` `INH` `CLOCK` `RESET` `VDD` |
| `CD4040B` (`CD4040` `CD4040BE`) | `dip16` | `Q12` `Q6` `Q5` `Q7` `Q4` `Q3` `Q2` `VSS` `Q1` `CLOCK` `R` `Q9` `Q8` `Q10` `Q11` `VDD` |
| `CD4069UB` (`CD4069` `CD4069UBE`) `CD40106B` (`CD40106` `CD40106BE`) | `dip14` | `A` `G` `B` `H` `C` `I` `VSS` `J` `D` `K` `E` `L` `F` `VDD` |
| `CD4071B` `CD4081B` `CD4011B` `CD4001B` `CD4070B` (`B` / `BE` 無しも) | `dip14` | `A` `B` `J` `K` `C` `D` `VSS` `E` `F` `L` `M` `G` `H` `VDD` |
| `CD4013B` (`CD4013` `CD4013BE`) | `dip14` | `Q1` `/Q1` `CLOCK1` `RESET1` `D1` `SET1` `VSS` `SET2` `D2` `RESET2` `CLOCK2` `/Q2` `Q2` `VDD` (`/Q` は Q の上に線) |
| `74HC04` (`SN74HC04` `SN74HC04N`) | `dip14` | `1A` `1Y` `2A` `2Y` `3A` `3Y` `GND` `4Y` `4A` `5Y` `5A` `6Y` `6A` `VCC` |
| `74HC08` `74HC32` `74HC86` (`SN` 付き・`N` 付きも) | `dip14` | `1A` `1B` `1Y` `2A` `2B` `2Y` `GND` `3Y` `3A` `3B` `4Y` `4A` `4B` `VCC` |
| `74HC02` (`SN74HC02` `SN74HC02N`) | `dip14` | `1Y` `1A` `1B` `2Y` `2A` `2B` `GND` `3A` `3B` `3Y` `4A` `4B` `4Y` `VCC` (NOR は Y が A・B より前) |
| `74HC74` (`SN74HC74` `SN74HC74N`) | `dip14` | `1CLR` `1D` `1CLK` `1PRE` `1Q` `/1Q` `GND` `/2Q` `2Q` `2PRE` `2CLK` `2D` `2CLR` `VCC` (`CLR` `PRE` は上に線) |
| `L293D` (`L293DNE` `L293` `L293NE`) | `dip16` | `12EN` `1A` `1Y` `GROUND` `GROUND` `2Y` `2A` `VCC2` `34EN` `3A` `3Y` `GROUND` `GROUND` `4Y` `4A` `VCC1` |
| `MCP3008` | `dip16` | `CH0` `CH1` `CH2` `CH3` `CH4` `CH5` `CH6` `CH7` `DGND` `CS/SHDN` `DIN` `DOUT` `CLK` `AGND` `VREF` `VDD` |
| `74HC595` (`SN74HC595` `SN74HC595N`) | `dip16` | `QB` `QC` `QD` `QE` `QF` `QG` `QH` `GND` `QH'` `SRCLR` `SRCLK` `RCLK` `OE` `SER` `QA` `VCC` (`OE` `SRCLR` は上に線) |
| `CD4511B` (`CD4511` `CD4511BE`) | `dip16` | `INB` `INC` `LT` `BL` `LE/STROBE` `IND` `INA` `VSS` `Oe` `Od` `Oc` `Ob` `Oa` `Og` `Of` `VDD` (印字の入力 `A`〜`D` と出力 `a`〜`g` は大文字小文字だけが違うので `IN` と `O` を付けた) |
| `CD74HC283` (`CD74HC283E` `74HC283`) | `dip16` | `S1` `B1` `A1` `S0` `A0` `B0` `CIN` `GND` `COUT` `S3` `B3` `A3` `S2` `A2` `B2` `VCC` |
| `74HC163` (`SN74HC163N` `CD74HC163E` …) | `dip16` | `CLR` `CLK` `A` `B` `C` `D` `ENP` `GND` `LOAD` `ENT` `QD` `QC` `QB` `QA` `RCO` `VCC` (`CLR` `LOAD` は上に線。クリアは同期) |
| `74HC154` (`CD74HC154E` `SN74HC154N` …) | `dip24` | `Y0` `Y1` `Y2` `Y3` `Y4` `Y5` `Y6` `Y7` `Y8` `Y9` `Y10` `GND` `Y11` `Y12` `Y13` `Y14` `Y15` `E1` `E2` `A3` `A2` `A1` `A0` `VCC` (`E1` `E2` は上に線) |
| `62256` (`AS6C62256` `AS6C62256-55PCN` `HM62256` …) | `dip28` | `A14` `A12` `A7` `A6` `A5` `A4` `A3` `A2` `A1` `A0` `DQ0` `DQ1` `DQ2` `VSS` `DQ3` `DQ4` `DQ5` `DQ6` `DQ7` `CE` `A10` `OE` `A11` `A9` `A8` `A13` `WE` `VCC` (`CE` `OE` `WE` は上に線) |
| `6116` (`IDT6116SA` `HM6116` …) | `dip24` | `A7` `A6` `A5` `A4` `A3` `A2` `A1` `A0` `IO0` `IO1` `IO2` `GND` `IO3` `IO4` `IO5` `IO6` `IO7` `CS` `A10` `OE` `WE` `A9` `A8` `VCC` (`CS` `OE` `WE` は上に線。印字の `I/O` は `IO`) |
| `74HC245` (`SN74HC245N` `CD74HC245E` …) | `dip20` | `DIR` `A1` `A2` `A3` `A4` `A5` `A6` `A7` `A8` `GND` `B8` `B7` `B6` `B5` `B4` `B3` `B2` `B1` `OE` `VCC` |
| `74HC273` (`SN74HC273N` `CD74HC273E` …) | `dip20` | `CLR` `1Q` `1D` `2D` `2Q` `3Q` `3D` `4D` `4Q` `GND` `CLK` `5Q` `5D` `6D` `6Q` `7Q` `7D` `8D` `8Q` `VCC` (`CLR` は上に線) |
| `74HC14` (`SN74HC14` `SN74HC14N`) | `dip14` | `1A` `1Y` `2A` `2Y` `3A` `3Y` `GND` `4Y` `4A` `5Y` `5A` `6Y` `6A` `VCC` |
| `74HC00` (`SN74HC00` `SN74HC00N`) | `dip14` | `1A` `1B` `1Y` `2A` `2B` `2Y` `GND` `3Y` `3A` `3B` `4Y` `4A` `4B` `VCC` |
| `74HC161` (`SN74HC161` `SN74HC161N`) | `dip16` | `CLR` `CLK` `A` `B` `C` `D` `ENP` `GND` `LOAD` `ENT` `QD` `QC` `QB` `QA` `RCO` `VCC` (`CLR` `LOAD` は上に線。クリアは非同期。並びは 74HC163 と同じ) |
| `74HC194` (`CD74HC194` `CD74HC194E`) | `dip16` | `MR` `DSR` `D0` `D1` `D2` `D3` `DSL` `GND` `S0` `S1` `CP` `Q3` `Q2` `Q1` `Q0` `VCC` (`MR` は上に線) |
| `74HC10` (`SN74HC10` `SN74HC10N`) | `dip14` | `1A` `1B` `2A` `2B` `2C` `2Y` `GND` `3Y` `3A` `3B` `3C` `1Y` `1C` `VCC` (1 回路目の `1C` `1Y` は 13・12 番に離れて出る) |
| `74HC11` (`SN74HC11` `SN74HC11N`) | `dip14` | `1A` `1B` `2A` `2B` `2C` `2Y` `GND` `3Y` `3A` `3B` `3C` `1Y` `1C` `VCC` (並びは 74HC10 と同じ) |
| `74HC27` (`SN74HC27` `SN74HC27N`) | `dip14` | `1A` `1B` `2A` `2B` `2C` `2Y` `GND` `3Y` `3A` `3B` `3C` `1Y` `1C` `VCC` (並びは 74HC10 と同じ) |
| `74HC20` (`SN74HC20` `SN74HC20N`) | `dip14` | `1A` `1B` `NC` `1C` `1D` `1Y` `GND` `2Y` `2A` `2B` `NC` `2C` `2D` `VCC` (`NC` は 3・11 番。名前では指せず番号で呼ぶ) |
| `74HC30` (`CD74HC30` `CD74HC30E`) | `dip14` | `A` `B` `C` `D` `E` `F` `GND` `Y` `NC` `NC` `G` `H` `NC` `VCC` (`NC` は 9・10・13 番。番号で呼ぶ) |
| `74HC132` (`SN74HC132` `SN74HC132N`) | `dip14` | `1A` `1B` `1Y` `2A` `2B` `2Y` `GND` `3Y` `3A` `3B` `4Y` `4A` `4B` `VCC` (並びは 74HC08 と同じ) |
| `74HC125` (`SN74HC125` `SN74HC125N`) | `dip14` | `1OE` `1A` `1Y` `2OE` `2A` `2Y` `GND` `3Y` `3A` `3OE` `4Y` `4A` `4OE` `VCC` (`OE` は上に線) |
| `74HC126` (`SN74HC126` `SN74HC126N`) | `dip14` | `1OE` `1A` `1Y` `2OE` `2A` `2Y` `GND` `3Y` `3A` `3OE` `4Y` `4A` `4OE` `VCC` (並びは 74HC125 と同じ。`OE` の極性だけ違う) |
| `74HC393` (`SN74HC393` `SN74HC393N`) | `dip14` | `1CLK` `1CLR` `1QA` `1QB` `1QC` `1QD` `GND` `2QD` `2QC` `2QB` `2QA` `2CLR` `2CLK` `VCC` (`CLR` は H でクリア) |
| `74HC164` (`SN74HC164` `SN74HC164N`) | `dip14` | `A` `B` `QA` `QB` `QC` `QD` `GND` `CLK` `CLR` `QE` `QF` `QG` `QH` `VCC` (`CLR` は上に線) |
| `74HC4066` (`CD74HC4066` `CD74HC4066E`) | `dip14` | `1Y` `1Z` `2Z` `2Y` `2E` `3E` `GND` `3Y` `3Z` `4Z` `4Y` `4E` `1E` `VCC` (`Y` `Z` は双方向。`E` が制御 (H で導通)。端子図は D・PW の 14 ピンから (PDIP も同じ番号)) |
| `74HC138` (`SN74HC138` `SN74HC138N`) | `dip16` | `A` `B` `C` `G2A` `G2B` `G1` `Y7` `GND` `Y6` `Y5` `Y4` `Y3` `Y2` `Y1` `Y0` `VCC` (`G2A` `G2B` `Y0`〜`Y7` は上に線) |
| `74HC139` (`SN74HC139` `SN74HC139N`) | `dip16` | `1G` `1A` `1B` `1Y0` `1Y1` `1Y2` `1Y3` `GND` `2Y3` `2Y2` `2Y1` `2Y0` `2B` `2A` `2G` `VCC` (`G` と `Y` は上に線) |
| `74HC157` (`SN74HC157` `SN74HC157N`) | `dip16` | `A/B` `1A` `1B` `1Y` `2A` `2B` `2Y` `GND` `3Y` `3B` `3A` `4Y` `4B` `4A` `G` `VCC` (`A/B` が選択 (L で A)。`G` は上に線) |
| `74HC153` (`SN74HC153` `SN74HC153N`) | `dip16` | `1G` `B` `1C3` `1C2` `1C1` `1C0` `1Y` `GND` `2Y` `2C0` `2C1` `2C2` `2C3` `A` `2G` `VCC` (`A` `B` が選択。`G` は上に線) |
| `74HC151` (`SN74HC151` `SN74HC151N`) | `dip16` | `D3` `D2` `D1` `D0` `Y` `W` `G` `GND` `C` `B` `A` `D7` `D6` `D5` `D4` `VCC` (`W` は `Y` の反転。`A` `B` `C` が選択。`G` は上に線) |
| `74HC175` (`SN74HC175` `SN74HC175N`) | `dip16` | `CLR` `1Q` `/1Q` `1D` `2D` `/2Q` `2Q` `GND` `CLK` `3Q` `/3Q` `3D` `4D` `/4Q` `4Q` `VCC` (`CLR` は上に線。`/Q` は Q の上に線) |
| `74HC174` (`SN74HC174` `SN74HC174N`) | `dip16` | `CLR` `1Q` `1D` `2D` `2Q` `3D` `3Q` `GND` `CLK` `4Q` `4D` `5Q` `5D` `6Q` `6D` `VCC` (`CLR` は上に線) |
| `74HC112` (`SN74HC112` `SN74HC112N`) | `dip16` | `1CLK` `1K` `1J` `1PRE` `1Q` `/1Q` `/2Q` `GND` `2Q` `2PRE` `2J` `2K` `2CLK` `2CLR` `1CLR` `VCC` (`CLK` `PRE` `CLR` は上に線 (CLK は立ち下がりで動く)。`/Q` は Q の上に線) |
| `74HC390` (`CD74HC390` `CD74HC390E`) | `dip16` | `1CLKA` `1CLR` `1QA` `1CLKB` `1QB` `1QC` `1QD` `GND` `2QD` `2QC` `2QB` `2CLKB` `2QA` `2CLR` `2CLKA` `VCC` (`CLKA` `CLKB` `CLR` は上に線) |
| `74HC4040` (`SN74HC4040` `SN74HC4040N`) | `dip16` | `QL` `QF` `QE` `QG` `QD` `QC` `QB` `GND` `QA` `CLK` `CLR` `QI` `QH` `QJ` `QK` `VCC` (`QA` が 2 分周 (CD4040B の `Q1`)、`QL` が 4096 分周 (`Q12`)。`CLR` は H でクリア) |
| `74HC4060` (`SN74HC4060` `SN74HC4060N`) | `dip16` | `QL` `QM` `QN` `QF` `QE` `QG` `QD` `GND` `CLKO` `/CLKO` `CLKI` `CLR` `QI` `QH` `QJ` `VCC` (`QD` が 16 分周 … `QN` が 16384 分周 (`Q14`)。`/CLKO` は `CLKO` の上に線) |
| `74HC193` (`SN74HC193` `SN74HC193N`) | `dip16` | `B` `QB` `QA` `DOWN` `UP` `QC` `QD` `GND` `D` `C` `LOAD` `CO` `BO` `CLR` `A` `VCC` (`LOAD` `CO` `BO` は上に線。`CLR` は H でクリア) |
| `74HC165` (`SN74HC165` `SN74HC165N`) | `dip16` | `SH/LD` `CLK` `E` `F` `G` `H` `/QH` `GND` `QH` `SER` `A` `B` `C` `D` `CLKINH` `VCC` (`SH/LD` は LD の上に線。`/QH` は `QH` の上に線。`CLKINH` は印字の `CLK INH`) |
| `74HC85` (`CD74HC85` `CD74HC85E`) | `dip16` | `B3` `LTIN` `EQIN` `GTIN` `GTOUT` `EQOUT` `LTOUT` `GND` `B0` `A0` `B1` `A1` `A2` `B2` `A3` `VCC` (`LTIN` `EQIN` `GTIN` は印字の `(A < B) IN` `(A = B) IN` `(A > B) IN`、`GTOUT` `EQOUT` `LTOUT` は `(A > B) OUT` …) |
| `74HC123` (`CD74HC123` `CD74HC123E`) | `dip16` | `1A` `1B` `1R` `/1Q` `2Q` `2CX` `2RXCX` `GND` `2A` `2B` `2R` `/2Q` `1Q` `1CX` `1RXCX` `VCC` (`A` `R` は上に線。`/Q` は Q の上に線。`R` はリセット、`CX` `RXCX` は外付けの C と R) |
| `74HC4051` (`CD74HC4051` `CD74HC4051E`) | `dip16` | `A4` `A6` `A` `A7` `A5` `E` `VEE` `GND` `S2` `S1` `S0` `A3` `A0` `A1` `A2` `VCC` (`A` が共通、`A0`〜`A7` がチャネル、`S0`〜`S2` が選択。`E` は上に線。電源は `VCC` `VEE` `GND`) |
| `74HC4052` (`CD74HC4052` `CD74HC4052E`) | `dip16` | `B0` `B2` `BN` `B3` `B1` `E` `VEE` `GND` `S1` `S0` `A3` `A0` `AN` `A1` `A2` `VCC` (`AN` `BN` が共通、`A0`〜`A3` `B0`〜`B3` がチャネル。`E` は上に線) |
| `74HC4053` (`CD74HC4053` `CD74HC4053E`) | `dip16` | `B1` `B0` `C1` `CN` `C0` `E` `VEE` `GND` `S2` `S1` `S0` `A0` `A1` `AN` `BN` `VCC` (`AN` `BN` `CN` が共通、`A0` `A1` …がチャネル。`E` は上に線) |
| `74HC244` (`SN74HC244` `SN74HC244N`) | `dip20` | `1OE` `1A1` `2Y4` `1A2` `2Y3` `1A3` `2Y2` `1A4` `2Y1` `GND` `2A1` `1Y4` `2A2` `1Y3` `2A3` `1Y2` `2A4` `1Y1` `2OE` `VCC` (`OE` は上に線) |
| `74HC541` (`SN74HC541` `SN74HC541N`) | `dip20` | `OE1` `A1` `A2` `A3` `A4` `A5` `A6` `A7` `A8` `GND` `Y8` `Y7` `Y6` `Y5` `Y4` `Y3` `Y2` `Y1` `OE2` `VCC` (`OE1` `OE2` は上に線) |
| `74HC240` (`SN74HC240` `SN74HC240N`) | `dip20` | `1OE` `1A1` `2Y4` `1A2` `2Y3` `1A3` `2Y2` `1A4` `2Y1` `GND` `2A1` `1Y4` `2A2` `1Y3` `2A3` `1Y2` `2A4` `1Y1` `2OE` `VCC` (並びは 74HC244 と同じ。`OE` は上に線) |
| `74HC573` (`CD74HC573` `CD74HC573E`) | `dip20` | `OE` `1D` `2D` `3D` `4D` `5D` `6D` `7D` `8D` `GND` `LE` `8Q` `7Q` `6Q` `5Q` `4Q` `3Q` `2Q` `1Q` `VCC` (`OE` は上に線。`LE` が H の間つながる) |
| `74HC574` (`SN74HC574` `SN74HC574N`) | `dip20` | `OE` `1D` `2D` `3D` `4D` `5D` `6D` `7D` `8D` `GND` `CLK` `8Q` `7Q` `6Q` `5Q` `4Q` `3Q` `2Q` `1Q` `VCC` (`OE` は上に線。並びは 74HC573 と同じ (`LE` が `CLK`)) |
| `ULN2003A` (`ULN2003` `ULN2003APG` `ULN2003AN`) | `dip16` | `1B` `2B` `3B` `4B` `5B` `6B` `7B` `GND` `COM` `7C` `6C` `5C` `4C` `3C` `2C` `1C` (7 回路のダーリントン (シンクドライバ)。B が入力、C が出力、`GND` はデータシートの `E`。`COM` は負荷の電源側へ) |
| `3SK291` | `dip4` (2 列の変換基板) / `sip4` (1 列の変換基板) | `G1` `G2` `D` `S` (SMQ の 1〜4 番。基板が番号を変えていれば `pins:` で名前を書く)。面実装しか無いので、緑の変換基板に実寸の胴 (2.9 mm 角、印字 `U.F`) を載せた姿で描く |
| `SFU455B` (`SFU455A` `SFU455`) | `sip3` | `IN` `GND` `OUT` (村田の 455 kHz セラミックフィルタ。橙の胴で描く) |
| `KY-040` (`KY040`) | `sip5` | `CLK` `DT` `SW` `VCC` `GND` (ロータリーエンコーダのモジュール。基板のピンヘッダだけを緑の帯で描く。印字の `+` は `VCC`。CLK=A 相、DT=B 相、SW=押しボタン) |
| `HC-SR04` (`HCSR04`) | `sip4` | `VCC` `TRIG` `ECHO` `GND` (超音波距離センサのモジュール。青の帯で描く。`ECHO` は 5 V 出力) |
| `SG90` (`SG92R` `MG90S`) | `sip3` | `GND` `VCC` `SIG` (RC サーボ。青の胴で描く。コネクタの線は茶 (GND)・赤 (VCC)・橙 (SIG)) |
| `DHT11` | `sip4` | `VCC` `DATA` `NC` `GND` (温湿度センサ。青の胴で描く。3 番は `NC` で、番号で呼ぶ。`DATA` は 4.7 kΩ〜10 kΩ で `VCC` へ) |

### 3 ピンのトランジスタ・FET・レギュレータの穴の順

`Q1: transistor f5 f6 f7 2SC1815` のように**穴の名前を書かず、型番が下の表にあれば、書いた穴の順に表の名前で呼ぶ**
(ネットリストは `Q1.E` `Q1.C` `Q1.B`)。順は**印字面 (平らな面) を手前、ピンを下にして左から右**。
同じ TO-92 でも型番で並びが違う (2SC1815 は E C B、2N3904 は E B C、2N7000 は S G D、BS170 は D G S) ので、
**型番を書けば取り違えない**。ピンの名前を穴に書いたとき (`f5(B)`) は書いたとおりで、表は引かない
(裏向きに挿すなど、書き手が決めた並びを壊さない)。面実装の変換基板 (`sot23-dip` など) も引かない。
`regulator` も同じ (`U1: regulator f5 f6 f7 7805`)。回路図は記号 (`npn` `pnp` `njfet` …) でピンの名前が決まっており、
**型番の極性が記号と食い違うとお知らせ**が出る (`Q1: npn … 2SA1015` は PNP)。

| 型番 | 種類 | 穴の順 (印字面を手前、ピンを下にして左から) | パッケージ |
| --- | --- | --- | --- |
| `2SC1815` (`2SC1815Y` `2SC1815GR` `2SC1815BL` …) | `transistor` | `E` `C` `B` | TO-92 |
| `2SA1015` (`2SA1015Y` `2SA1015GR` `2SA1015-Y` …) | `transistor` | `E` `C` `B` | TO-92 |
| `2SC2120` (`2SC2120Y` `2SC2120O` `2SC2120-Y` …) | `transistor` | `E` `C` `B` | TO-92 |
| `2SA950` (`2SA950Y` `2SA950O` `2SA950-Y` …) | `transistor` | `E` `C` `B` | TO-92 |
| `2SC2655` (`2SC2655Y` `2SC2655O` `2SC2655-Y` …) | `transistor` | `E` `C` `B` | TO-92MOD。太い TO-92 (2-5J1A) |
| `2SA1020` (`2SA1020Y` `2SA1020O` `2SA1020-Y` …) | `transistor` | `E` `C` `B` | TO-92MOD。太い TO-92 (2-5J1A) |
| `2N3904` | `transistor` | `E` `B` `C` | TO-92 |
| `2N3906` | `transistor` | `E` `B` `C` | TO-92 |
| `2N2222A` (`2N2222` `PN2222A` `PN2222`) | `transistor` | `E` `B` `C` | TO-92 / TO-18。**onsemi の `P2N2222A` は C B E (STYLE 17) で逆**。金属缶 TO-18 は番号 (1=E 2=B 3=C) を穴の順に書く |
| `P2N2222A` | `transistor` | `C` `B` `E` | TO-92。onsemi の STYLE 17。`PN2222A` (E B C) と C と E が逆 |
| `2SC1008` | `transistor` | `E` `B` `C` | TO-92。同世代の 2SC1815 (E C B) と違い E B C。**原典の資料は見つからず JCET 製の資料による** |
| `2SK30A` (`2SK30ATM` `2SK30A-Y` `2SK30A-GR` …) | `transistor` | `S` `G` `D` | TO-92。2SK170・2SK117 は D G S で S と D が逆 |
| `2SK170` (`2SK170-BL` `2SK170-GR` `2SK170-V` …) | `transistor` | `D` `G` `S` | TO-92。2SK30A は S G D で S と D が逆 |
| `2SK117` (`2SK117-BL` `2SK117-GR` `2SK117-Y`) | `transistor` | `D` `G` `S` | TO-92 |
| `2SJ74` (`2SJ74-BL` `2SJ74-GR` `2SJ74-V` …) | `transistor` | `D` `G` `S` | TO-92。2SK170 の相補品。並びも同じ |
| `2N7000` | `transistor` | `S` `G` `D` | TO-92。**BS170 は D G S で逆**。**実物で確かめる: onsemi の 2007 年版の図は S G D、2022 年版の表は D G S で食い違い、表は 2007 年版 (S G D) に従う。実物はテスタで確かめる** |
| `BS170` | `transistor` | `D` `G` `S` | TO-92。**2N7000 は S G D で逆** |
| `IRF520` (`IRF520N` `IRF540` `IRF540N` …) | `transistor` | `G` `D` `S` | TO-220。タブは D。IRLZ44N は Vgs 最大 ±16 V |
| `IRF9540` (`IRF9540N` `IRF9Z34N`) | `transistor` | `G` `D` `S` | TO-220。並びは N チャネルと同じ G D S。タブは D |
| `2SK2231` | `transistor` | `G` `D` `S` | PW-Mold (面実装)。**TO-220 ではなく面実装 (DPAK 相当)**。タブは D。基板に挿すには変換基板が要る |
| `2N7002` (`2N7002K` `2N7002A`) | `transistor` | `G` `S` `D` | SOT-23 (面実装)。穴の順は端子の番号 1 G・2 S・3 D とみなす (変換基板の穴の並びは基板ごとに違うので、買った基板で確かめる)。ブレッドボードには `transistor/sot23-dip` |
| `2SD882` | `transistor` | `E` `C` `B` | TO-126。**実物で確かめる: ST の資料だけ図が B C E で、他は E C B。表は E C B。実物はテスタで確かめる** |
| `2SB772` | `transistor` | `E` `C` `B` | TO-126 |
| `7805` (`L7805` `L7805CV` `LM7805` …) | `regulator` | `IN` `GND` `OUT` | TO-220。78L05 (TO-92) は逆の並び |
| `78L05` (`L78L05` `UA78L05` `MC78L05` …) | `regulator` | `OUT` `GND` `IN` | TO-92。7805 (TO-220) は逆の並び |
| `7905` (`L7905` `L7905CV` `LM7905` …) | `regulator` | `GND` `IN` `OUT` | TO-220 (負電圧)。**7805 と並びが違う** (1 番が GND、2 番が IN)。**タブは IN** |
| `79L05` (`L79L05` `LM79L05` `MC79L05` …) | `regulator` | `GND` `IN` `OUT` | TO-92 (負電圧)。**78L05 (OUT GND IN) と並びが違う** |
| `LM317` (`LM317T` `LM317MP`) | `regulator` | `ADJ` `OUT` `IN` | TO-220。`GND` ではなく `ADJ`。タブは OUT |

## 配線

```yaml
wires:
  - +t5 -- a5 red                # 端点 2 つ
  - b10 -- b14 -- b21 orange     # つないで書く (区間ごとに開かれる)
  - j20 -- -b20 black [v-20]     # 迂回ヒント。20 が穴 1 つぶん
```

色: `red black white gray` (`grey` も可) `orange yellow green blue purple brown pink`

端点が部品のピンと同じ穴なら、部品のほうが同じ列の空いた行へ寄って描かれる
(実物では同じ穴に挿せないため。ピン参照 `U1.7` では寄らない)。

## 注釈

```yaml
notes:
  - circle R1                    # 指し先を囲む楕円
  - box a5 e12 blue solid        # 枠 (既定は破線)
  - arrow d22 R1                 # 指し棒
  - line +t20 -t20 green         # 直線
  - text d24 large bold: 電流を決めるのはここ
  - text e5 red large bold: IN 5V  # 目立たせる字 (透かさず白い縁)
  - source tiny                  # フェンスそのものを書き出す (板の下の帯へ)
  - text: 仮組み。あとで直す       # 番地を書かなければ板の下
```

語 (順不同): 色 `red blue green orange ink` / 大きさ `tiny small normal large huge` /
寄せ `left center right` / `bold` / `solid` (box) / 行送り `tight loose` (source)

`large` (1.4 倍) か `huge` か `bold` を書いた字は、基板に重ねても**透かさず**、縁を白にする。

**`text` と `source` は番地を書かなければ基板の下の帯に置く** (`below` が既定)。
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
  stamp: off           # on (既定) / off。右下に版を刻むか
```

## 落とし穴

- **色は `"…"` で囲む。** `text-color: #333` は `#` から先が YAML のコメントになり、
  値が空で届く。
- **`text` の字は `:` の後ろ。** `- text a5 "R1: …"` は「知らない語」と言われる。
  字にコロンと空白の並びを含むなら後ろを囲む: `- text a5: "R1: …"`
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
- **値の数には単位を付ける。** 素の数でよいのは抵抗 (`330` = 330Ω) だけ。
  コンデンサ・インダクタは接頭辞が要る (`100n` `47p` `10u` / `100u` `10m`)。`47` は断る
- **読めない抵抗値は断る** (`whatever`、`10k 1% 2%`、色の無い `10k 3%`)。
  書けるのは `330` `4k7` `1M` `10k 5%` `10k 1% 50ppm`、0Ω のジャンパは `0`
- 点の名前に**番地の形・レール名 (`-t`)・ハイフンだけの語・`below`** は使えない。

## 直し方

読めなかった行は、行番号・行の中身・綴りの下の印つきで返る。

```text
bread: 2 行目: 知らない部品の種類です: resistr (resistor のことですか?)
      R1: resistr a5 a10 10k
          ^^^^^^^
```

`breadboard-fence check <ファイル>` で、図を書かずに検証とネットリストだけ出せる
(読めない行があれば終了コードは 1)。
