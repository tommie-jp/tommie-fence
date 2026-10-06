# circuit フェンス 早見表

1 画面ぶんの文法。詳しい説明と図は [01-syntax.md](01-syntax.md)。
LLM に書かせるときは、この 1 枚をそのまま渡せる。

## 全体の形

````text
```circuit
title: 図01 …     # 任意。図の上に載せる 1 行の題
points:            # 任意。番地に名前を付ける
  fb: d4
parts:             # ID: 種類 番地 …
  R1: resistor a1 a3 10k
wires:             # - 端点 -- 端点 [-- 端点 …]
  - a3 -- fb
notes:             # 任意。図に重ねる印と字
  - circle R1
style:             # 任意。見た目
  grid: on
```
````

## 番地

- 行は `a`〜`z` (上から下)、列は `1`〜`99` (左から右)。`a1` が左上
- 大文字でもよい (`A1` = `a1`)。宣言は要らない
- 交点の間は**組**を足す (`a1a5` は列が半分、`a1f0` は行が半分、`a1f5` は両方)。
  英字が行・数字が列のずれで、`a` = 0 の 10 段 (`f` = .5)。2 組で 1/100 まで。
  ずれの無い組 (`a1a0`) は書かない。`a1.5` はピン (`U1.5`) なので通さない
- `points:` に付けた名前は、**番地を書ける場所ならどこでも**使える

## 部品 (`parts:`)

| 形 | 書き方 | 例 |
| --- | --- | --- |
| 2 端子 | `ID: 種類 番地 番地 [値] [l=字] [i=字] [v=字]` | `R1: resistor a1 a3 10k` |
| 1 端子 | `ID: 種類 番地` | `G1: ground c3` |
| 多端子 | `ID: 種類 番地 [向き] [型番]` | `U1: opamp c5 +up` |
| 機器 | マップ形式 (下記) | `type: device` |

- **向きのある部品は、先に書いた番地が + 側 (アノード)**。例外なし
- **向き**は回転 `r90` / `r180` / `r270` (時計回り) と左右反転 `mirror`。
  併記できる (`Q1: npn a1 r90 mirror`)。順は問わない。2 端子は番地の順が
  向きなので書かない。回せるのは多端子と `ground`、反転できるのは多端子。
  例外は 3 つ — `dip4`〜`dip40` と `ground` は反転できず (字が鏡文字・左右対称)、
  `transformer` は反転だけ (回すと巻線と鉄心がばらける)
- オペアンプだけ ± の上下 `+up` / `+down` を持つ。回転とは別の鍵なので併記できる
- `i=字` は電流の矢 (先に書いた番地 → 後の番地の向き)、`v=字` は電圧の符号
  (先に書いた番地が +)。字は ID と同じで先頭 1 文字が本体・残りが添字。
  **`v=` は値とも `i=` とも並べられない** (図の同じ側に出る)。
  極性のある部品で矢だけ返したいときは `i<=` `v<=`
- `l=字` は図に出るラベル (ID の代わり。ネット名は ID のまま)。`$…$` で囲むと
  数式の部分集合が使える — 英数字・`\dot{…}`・`\mathrm{…}`・添字 `_` だけ。
  **生の TeX は通らない** (読み直して組み直す)。空白は書けない
- 値は種類から単位を補う (抵抗の `10k` → 10 kΩ)。使える字は英数字と
  `. + - / ( ) _ %` (日本語は `--emit-tex` でだけ通る)
- **素の数でよいのは抵抗 (Ω) と電圧源 (V) だけ。** C・L・水晶・電流源は接頭辞が要る
  (`47p` `100n` `10u` / `100u` `10m` / `16M` / `1m`。`47` は断る)。単位まで書いた `47pF` は
  `47p` と同じ。接頭辞は小文字の `k` (`100K` は断る)
- ピンは名前で指す (`Q1.B` `U1.out` `U1.1`)
- **機器 (モジュール) はマップ形式**。ピンの名前は `pins:` に並べた順に箱の上から。
  名前でも番号でも指せる (`M1.TRIG` = `M1.2`)。使わないピンは ERC が言わない

```yaml
parts:
  M1:
    type: device
    at: c2
    label: HC-SR04              # 任意。箱の中の名前
    pins: [VCC, TRIG, ECHO, GND]
    turn: mirror                # 任意。1 行形式と同じ語
```

- ネットリストの箱のピンは図に刷った名前で出る (`U1.GP0` `J1.VBUS` `M1.ECHO`)

### 種類

- 抵抗系 `resistor` `resistor-var` `potentiometer` `photoresistor`
  `thermistor` `thermistor-ntc` `thermistor-ptc` `varistor`
- 容量・コイル `capacitor` `capacitor-var` `ecap` `varicap` `inductor` `crystal`
- ダイオード系 `diode` `led` `zener` `schottky` `photodiode` `diac`
  `thyristor` `triac`
- 電源 `vsource` `sine` `square` `triangle` `isource` `battery` `solar`
- 開閉・出力・計器 `switch` `switch-nc` `button` `button-nc` `reed` `fuse` `ferrite-bead` (フェライトビーズ。塗りつぶした箱) `motor` `tline` (伝送線路。値は Z0)
  `lamp` `speaker` `mic` `short` `ammeter` `voltmeter` `ohmmeter` `wattmeter`
  `galvanometer` `detector`
- 1 端子 `port` `antenna` `ground` `vcc` `vee`
  (`vcc` / `vee` は電圧を書ける: `VCC: vcc a1 5V` で図に `+5V`、ネットは `VCC`)
- 能動 `npn` `pnp` `nigbt` `pigbt` `nmos` `pmos` `njfet` `pjfet`
  `nmos-e` `pmos-e` `nmos-d` `pmos-d` `nmos-dg` (デュアルゲート。ピン 4 本: `G1` `G2` `D` `S`) `opamp` `transformer` `phototransistor`
- 論理 `and` `or` `nand` `nor` `xor` `xnor` `not` `buffer` `spdt` `slide-switch`
  (IC のゲートは ID の末尾の大文字が回路 + 型番: `U1A: nand c3 74HC00` でピンの番号 1・2 → 3 が添わる。`U1B` は 4・5 → 6)
  `dip4` `dip6` `dip8` `dip14` `dip16` `dip18` `dip20` `dip24` `dip28` `dip40`
- ブザー・イヤホン `buzzer` `earphone` (スピーカーの記号で描く)
- SMA コネクタ `sma` (ピンは `1` 中心導体 / `2` 外皮)
- 三端子レギュレータ `regulator` (ピンは `in` `gnd` `out`。番号でも可)
- ピンを働きで並べた IC `ic` (型番が要る: `NE555` `TLC555` `CD4511B` `74HC163` `74HC154` `62256` と 74HC の `74HC161` `74HC595` `74HC164` `74HC165` `74HC194` `74HC138` `74HC139` `74HC157` `74HC153` `74HC151` `74HC573` `74HC574` `74HC273` `74HC245` `74HC283` `74HC85` `74HC393` `74HC4040` `74HC4060` `74HC74` `74HC174` `74HC193` `74HC4051` `74HC4052`、4000 系の `CD4040B` `CD4013B`、アナログの `SA612` (ミキサ) `LM386` (パワーアンプ)。電源が上・GND が下・入力が左・出力が右。
  ピンは箱の中心から半マス刻み。向きは書けない。基板には無い)
- 3 ピンの IC `ic3` (同じ箱。ピンは `1` `2` `3`、マップ形式の `pins:` で名前を付けられる)
- セラミックフィルタ `ceramic-filter` (同じ箱。ピンは `in` `gnd` `out`。番号でも可。基板では `sip3` + `SFU455B`)
- ピンヘッダ (ピンは番号)
  `sip2` `sip3` `sip4` `sip5` `sip6` `sip8` `sip10` `sip20` `sip40`
- USB コネクタ (ピンは `VBUS` `GND` `D+` `D-`、Type-C は `CC1` `CC2` も。番号でも可)
  `usb-a` `usb-c`
- マイコンボード (ピンは実物の印字で `U1.GP0`。図には `01 GP0` と番号も出る)
  `pico` `pico-w` `pico2` `pico2-w` `tang-nano-9k` (FPGA。ピンは `IO38` など)
- ピンに名前のある部品 (名前でも実物のピンの番号でも可。下の表)
  `relay` `photocoupler` `seg7` `dip-switch4` `dip-switch8`

略記: `r` `c` `l` `d` `i` `v` `dc` `ac` `gnd` `op` `ec` `pot` `ldr` `ntc`
`ptc` `xtal` `cfilter` `scr` `bat` `sw` `btn`

### ピンの名前

| 種類 | ピン |
| --- | --- |
| `npn` / `pnp` | `B` `C` `E` |
| `phototransistor` | `C` `E` |
| `nigbt` / `pigbt` | `G` `C` `E` |
| FET 各種 | `G` `D` `S` |
| `opamp` | `+` `-` `out` |
| `transformer` | `A1` `A2` `B1` `B2` |
| 2 入力ゲート | `a` `b` (`1` `2`) / `out` |
| `not` / `buffer` | `in` / `out` |
| `spdt` | `in` (`c`) / `1` `2` |
| `slide-switch` | 同上 (記号も同じ) |
| `dipNN` | `1` 〜 ピンの本数。型番が下の表にあれば印字の名前でも (`U1.TRIG` = `U1.2`) |
| `ic` | 型番の印字の名前 (`U1.TRIG`) か番号 (`U1.2`)。`dipNN` と同じ |
| `nmos-dg` | `G1` `G2` `D` `S` (`gate1` `gate2` `drain` `source` でも。`G` だけは断る) |
| `device` | `pins:` に書いた名前 (`1` 〜 本数でも可) |
| `relay` | `A1` `A2` / `COM1` `NC1` `NO1` / `COM2` `NC2` `NO2` |
| `photocoupler` | `A` `K` / `C` `E` |
| `seg7` | `a` 〜 `g` `dp` `COM1` `COM2` |
| `dip-switch4` / `dip-switch8` | `A1` 〜 / `B1` 〜 (k 番のスイッチは `Ak`–`Bk`。DIP の番号でも可) |
| `potentiometer` | `w` |
| `thyristor` / `triac` | `g` |

**DIP のピンの名前の表** (型番を書くと箱の中に `1 GND` `VCC 8` のように名前と番号が出る。
大文字小文字は問わないが、綴りは完全一致。ネットリストは名前で出る)。
表に無い型番は番号だけで描き、お知らせが出る。2 本以上に刷られた名前 (`NC` `GROUND`) は番号で指す。

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
| `3SK291` | `dip4` | `G1` `G2` `D` `S` (面実装 SMQ の 4 ピンを変換基板に載せた形。回路図の記号は `nmos-dg` で、`dip4` には書かない) |
| `SFU455B` (`SFU455A` `SFU455`) | `sip3` | `IN` `GND` `OUT` (セラミックフィルタ。橙の胴で描く。回路図の記号は `ceramic-filter`) |

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
| `2N7000` | `transistor` | `S` `G` `D` | TO-92。**BS170 は D G S で逆**。onsemi の 2022 年版は本文の表が D G S と読める (誤記説あり・未確認)。買った品の資料かテスタで確かめる |
| `BS170` | `transistor` | `D` `G` `S` | TO-92。**2N7000 は S G D で逆** |
| `IRF520` (`IRF520N` `IRF540` `IRF540N` …) | `transistor` | `G` `D` `S` | TO-220。タブは D。IRLZ44N は Vgs 最大 ±16 V |
| `IRF9540` (`IRF9540N` `IRF9Z34N`) | `transistor` | `G` `D` `S` | TO-220。並びは N チャネルと同じ G D S。タブは D |
| `2SK2231` | `transistor` | `G` `D` `S` | PW-Mold (面実装)。**TO-220 ではなく面実装 (DPAK 相当)**。タブは D。基板に挿すには変換基板が要る |
| `2SD882` | `transistor` | `E` `C` `B` | TO-126。**ST の資料だけ図が B C E で食い違う**。実物をテスタで確かめる |
| `2SB772` | `transistor` | `E` `C` `B` | TO-126 |
| `7805` (`L7805` `L7805CV` `LM7805` …) | `regulator` | `IN` `GND` `OUT` | TO-220。78L05 (TO-92) は逆の並び |
| `78L05` (`L78L05` `UA78L05` `MC78L05` …) | `regulator` | `OUT` `GND` `IN` | TO-92。7805 (TO-220) は逆の並び |
| `LM317` (`LM317T` `LM317MP`) | `regulator` | `ADJ` `OUT` `IN` | TO-220。`GND` ではなく `ADJ`。タブは OUT |

## 配線 (`wires:`)

| 演算子 | 引き方 |
| --- | --- |
| `--` | 2 点をまっすぐ (斜めもそのまま) |
| `-\|` | 先に横、それから縦 |
| `\|-` | 先に縦、それから横 |

- 端点は番地かピン (`U1.out`)。**3 つ以上つないで書ける** (`b1 -- b3 |- U1.+`)
- 端が 3 つ以上集まる交点と T 字には、分岐の黒丸が自動で付く
- **ピンへは `|-` か `-|` で引く** (`--` だと斜めに入る)。中心線に出るピン
  (`B` `C` `E` / `G` `D` `S` / `out` / `in`) へ軸を揃えて引くときだけ `--` でよい
- ピンへ引いた線の途中には当てられない。当てたい番地を通る配線に分ける

## 注釈 (`notes:`)

| 書き方 | 何が出るか |
| --- | --- |
| `- circle 部品IDか番地 [色]` | 囲む丸 |
| `- box 番地 番地 [色] [solid]` | 枠 (既定は破線、`solid` で実線) |
| `- arrow 起点 終点 [色]` | 指し棒 |
| `- line 起点 終点 [色]` | 直線 (矢なし。罫線に使える) |
| `- text 番地 [語]: 文字` | 図に重ねる字 |
| `- source 番地 [語]` | フェンスの中身そのもの |

- 語は順不同。色 `red` / `blue` / `green` / `orange`、図の線と同じ色は `ink`、
  大きさ `tiny` / `small` / `normal` / `large` / `huge`、
  寄せ `left` / `center` / `right`、太字 `bold`
- 行送り `tight` / `loose` は `source` にだけ書ける (既定はその中間)
- 字に `:` を含むときは `"…"` で囲む (YAML がマップとして読むため)
- 注釈は回路の一員ではない (ネットリストにも黒丸にも数えない)

## 題 (`title:`)

- `title: 図01 circuit フェンスの書き方` の 1 行。図の左上に載る
- 大きさ・太さ・色は選べない (`large` の太字、図のほかの文字と同じ色)
- 60 文字まで。折り返さない
- **`notes:` の字では置けない** (番地は `a1` が最上段で、その上が無い)

## 見た目 (`style:`)

| 項目 | 値 | 既定 |
| --- | --- | --- |
| `theme` | `auto` / `light` / `dark` / `mono` | `auto` |
| `grid` | `on` / `off` [大きさ] [色] | `off` |
| `grid-to` | 番地 | 使っている範囲 |
| `pitch` | 0.5〜5 (cm) | `2` |
| `standard` | `american` / `european` / `jis` (現行の JIS C 0617。電験の図) | `american` |
| `wire-width` | 0.2〜4 (pt) | `0.8` |
| `width` | 120〜4000 (ドット) | 読み手の字に合わせる |
| `stamp` | `on` / `off` | `on` |
| `debug` | `on` / `off` (お知らせを出す) | `on` |
| `ink-color` / `paper-color` / `grid-color` | `"#rgb"` / `"#rrggbb"` | テーマの色 |

`grid: on large red` のように、`on` のあとへ行英字と列数字の大きさと色を
順不同で書ける (語は注釈と同じ並び。変わるのは字だけで、点は `grid-color`)。

テーマだけなら `style: dark` の 1 行でよい。
**色は `"…"` で囲む** (`#` から先は YAML のコメント)。
処理系の版は既定で右下に刻む。消すなら `stamp: off` (**字は書かない**。処理系が埋める)。
`debug: off` はお知らせ (描けてはいるが思ったとおりには出ない、の類) を伏せる。
**読めなかった行は伏せられない**。`check` は off でも言う。

## よく踏むところ

- `ink-color: #333` → 値が消える。`"#333"` と囲む
- `- text b1: R1: resistor a1 a3` → YAML がマップとして読む。字を `"…"` で囲む
- `U1.+ -- c3` → 斜めに入る。`U1.+ |- c3` と書く
- 部品 ID と `points:` の名前は重ねられない (注釈の指し先が決まらない)
- 番地の形 (`a1`) は `points:` の名前に使えない

## 確かめる

```bash
circuit-fence check <ファイルかディレクトリ...>   # 描かずに確かめる (ERC つき)
circuit-fence --version
```

`check` は図を描かず、読めなかった行とネットリストだけを出す (速い)。
読めなかった行があれば 0 以外で終わる。
`--version` は処理系の版を出す。

図を書き出すのは `render`、手元の LaTeX 用の `.tex` は `render --emit-tex`。
プレビューの外 (ブラウザ・GitHub) で開く `.svg` は `render --embed-fonts` (TeX のフォントを埋め込み、`Ω` `µ` を化けさせない)。
