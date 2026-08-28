# 使える部品

2 端子部品は `ID: 種類 番地 番地 [値]` の 1 行で書く。

```circuit
title: 図01 使える部品
parts:
  R1: resistor a1 a3 10k
  C1: capacitor a4 a6 100n
  C2: ecap a7 a9 100u
  L1: inductor a10 a12 10m
  D1: diode c1 c3 1N4148
  D2: led c4 c6
  D3: zener c7 c9 5V1
  V1: vsource e1 e3 5
  V2: sine e4 e6 1
  I1: isource e7 e9 20m
  B1: battery g1 g3 9
  S1: switch g4 g6
  F1: fuse g7 g9 3A
  P1: lamp i1 i3
notes:
  - text a.7_2 blue center: "R1: resistor a1 a3 10k"
  - text a.95_2 blue center: 抵抗
  - text a.7_5 blue center: "C1: capacitor a4 a6 100n"
  - text a.95_5 blue center: コンデンサ
  - text a.7_8 blue center: "C2: ecap a7 a9 100u"
  - text a.95_8 blue center: 電解コンデンサ
  - text a.7_11 blue center: "L1: inductor a10 a12 10m"
  - text a.95_11 blue center: コイル
  - text c.7_2 blue center: "D1: diode c1 c3 1N4148"
  - text c.95_2 blue center: ダイオード
  - text c.7_5 blue center: "D2: led c4 c6"
  - text c.95_5 blue center: LED
  - text c.7_8 blue center: "D3: zener c7 c9 5V1"
  - text c.95_8 blue center: ツェナー
  - text e.7_2 blue center: "V1: vsource e1 e3 5"
  - text e.95_2 blue center: 直流電源
  - text e.7_5 blue center: "V2: sine e4 e6 1"
  - text e.95_5 blue center: 交流電源
  - text e.7_8 blue center: "I1: isource e7 e9 20m"
  - text e.95_8 blue center: 定電流源
  - text g.7_2 blue center: "B1: battery g1 g3 9"
  - text g.95_2 blue center: 電池
  - text g.7_5 blue center: "S1: switch g4 g6"
  - text g.95_5 blue center: スイッチ
  - text g.7_8 blue center: "F1: fuse g7 g9 3A"
  - text g.95_8 blue center: ヒューズ
  - text i.7_2 blue center: "P1: lamp i1 i3"
  - text i.95_2 blue center: ランプ
style:
  grid: on
```

値は種類から単位を補う (抵抗の `10k` → 10 kΩ、コイルの `10m` → 10 mH)。
ダイオードやスイッチのように値が型番や定格のものは、書いたとおりに出る。

`ecap` (電解コンデンサ) は先に書いた番地が + 側になる。上の `C2` なら a9 が +
(記号の平らな板のほう。丸い板が - 側)。

## そのほかの 2 端子部品

センサ・スイッチ・波形の違う電源・計器。書き方は同じ 1 行。

```circuit
title: 図02 そのほかの 2 端子部品
parts:
  R2:  resistor-var a1 a3 10k
  D4:  varicap a4 a6 33p
  X1:  crystal a7 a9 16M
  R3:  photoresistor a10 a12
  R4:  thermistor c1 c3 10k
  R5:  thermistor-ntc c4 c6 10k
  R6:  thermistor-ptc c7 c9
  R7:  varistor c10 c12 470V
  D5:  schottky e1 e3 1N5819
  D6:  photodiode e4 e6
  D7:  diac e7 e9
  V3:  square e10 e12 5
  V4:  triangle g1 g3 1
  PV1: solar g4 g6 0.6
  S2:  switch-nc g7 g9
  S3:  button g10 g12
  S4:  button-nc i1 i3
  S5:  reed i4 i6
  LS1: speaker i7 i9
  MK1: mic i10 i12
  A1:  ammeter k1 k3
  V5:  voltmeter k4 k6
  M1:  ohmmeter k7 k9
  W1:  wattmeter k10 k12
  G1:  galvanometer m1 m3
  D8:  detector m4 m6
notes:
  - text a.7_2 blue center: "R2: resistor-var a1 a3 10k"
  - text a.95_2 blue center: 可変抵抗
  - text a.7_5 blue center: "D4: varicap a4 a6 33p"
  - text a.95_5 blue center: バリキャップ
  - text a.7_8 blue center: "X1: crystal a7 a9 16M"
  - text a.95_8 blue center: 水晶振動子
  - text a.7_11 blue center: "R3: photoresistor a10 a12"
  - text a.95_11 blue center: CdS セル
  - text c.7_2 blue center: "R4: thermistor c1 c3 10k"
  - text c.95_2 blue center: サーミスタ
  - text c.7_5 blue center: "R5: thermistor-ntc c4 c6 10k"
  - text c.95_5 blue center: NTC サーミスタ
  - text c.7_8 blue center: "R6: thermistor-ptc c7 c9"
  - text c.95_8 blue center: PTC サーミスタ
  - text c.7_11 blue center: "R7: varistor c10 c12 470V"
  - text c.95_11 blue center: バリスタ
  - text e.7_2 blue center: "D5: schottky e1 e3 1N5819"
  - text e.95_2 blue center: ショットキー
  - text e.7_5 blue center: "D6: photodiode e4 e6"
  - text e.95_5 blue center: フォトダイオード
  - text e.7_8 blue center: "D7: diac e7 e9"
  - text e.95_8 blue center: ダイアック
  - text e.7_11 blue center: "V3: square e10 e12 5"
  - text e.95_11 blue center: 方形波電源
  - text g.7_2 blue center: "V4: triangle g1 g3 1"
  - text g.95_2 blue center: 三角波電源
  - text g.7_5 blue center: "PV1: solar g4 g6 0.6"
  - text g.95_5 blue center: 太陽電池
  - text g.7_8 blue center: "S2: switch-nc g7 g9"
  - text g.95_8 blue center: b 接点スイッチ
  - text g.7_11 blue center: "S3: button g10 g12"
  - text g.95_11 blue center: 押しボタン
  - text i.7_2 blue center: "S4: button-nc i1 i3"
  - text i.95_2 blue center: b 接点ボタン
  - text i.7_5 blue center: "S5: reed i4 i6"
  - text i.95_5 blue center: リードスイッチ
  - text i.7_8 blue center: "LS1: speaker i7 i9"
  - text i.95_8 blue center: スピーカー
  - text i.7_11 blue center: "MK1: mic i10 i12"
  - text i.95_11 blue center: マイク
  - text k.7_2 blue center: "A1: ammeter k1 k3"
  - text k.95_2 blue center: 電流計
  - text k.7_5 blue center: "V5: voltmeter k4 k6"
  - text k.95_5 blue center: 電圧計
  - text k.7_8 blue center: "M1: ohmmeter k7 k9"
  - text k.95_8 blue center: 抵抗計
  - text k.7_11 blue center: "W1: wattmeter k10 k12"
  - text k.95_11 blue center: 電力計
  - text m.7_2 blue center: "G1: galvanometer m1 m3"
  - text m.95_2 blue center: 検流計
  - text m.7_5 blue center: "D8: detector m4 m6"
  - text m.95_5 blue center: 検出器
style:
  grid: on
```

`switch` / `button` は a 接点 (ふだん開いている)、`-nc` が付くほうは b 接点。
水晶の値は周波数なので、`16M` と書くと 16 MHz になる。

NTC と PTC のサーミスタは**同じ記号で描き、区別は ID の下に字で書く**。
circuitikz の NTC / PTC の記号は中に θ を持っていて、フェンスの TeX には
その大きさの字形が無く `#` で出るため (`op amp` の ± と同じ壊れ方)。

## 1 端子の記号

`port` (端子) と `ground` のほかに、電源レールの `vcc` / `vee` がある。
`ground` 以外は **ID がそのまま図に出て、乗っているネットの名前にもなる**。

```circuit
title: 図03 1 端子の記号
parts:
  VCC: vcc a1
  VEE: vee a3
  G1:  ground a5
  IN:  port a7
notes:
  - text a.7_1 blue center: "VCC: vcc a1"
  - text a.7_3 blue center: "VEE: vee a3"
  - text a.7_5 blue center: "G1: ground a5"
  - text a.7_7 blue center: "IN: port a7"
style:
  grid: on
```

グラウンドは離して描いても同じ節点になるが、**電源レールはならない**
(5V と 3V3 を同じネットにしてしまうため)。つなぐなら配線を引く。
