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
  - text a.7_1 blue: "R1: resistor a1 a3 10k"
  - text a.7_4 blue: "C1: capacitor a4 a6 100n"
  - text a.7_7 blue: "C2: ecap a7 a9 100u"
  - text a.7_10 blue: "L1: inductor a10 a12 10m"
  - text c.7_1 blue: "D1: diode c1 c3 1N4148"
  - text c.7_4 blue: "D2: led c4 c6"
  - text c.7_7 blue: "D3: zener c7 c9 5V1"
  - text e.7_1 blue: "V1: vsource e1 e3 5"
  - text e.7_4 blue: "V2: sine e4 e6 1"
  - text e.7_7 blue: "I1: isource e7 e9 20m"
  - text g.7_1 blue: "B1: battery g1 g3 9"
  - text g.7_4 blue: "S1: switch g4 g6"
  - text g.7_7 blue: "F1: fuse g7 g9 3A"
  - text i.7_1 blue: "P1: lamp i1 i3"
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
notes:
  - text a.7_1 blue: "R2: resistor-var a1 a3 10k"
  - text a.7_4 blue: "D4: varicap a4 a6 33p"
  - text a.7_7 blue: "X1: crystal a7 a9 16M"
  - text a.7_10 blue: "R3: photoresistor a10 a12"
  - text c.7_1 blue: "R4: thermistor c1 c3 10k"
  - text c.7_4 blue: "R5: thermistor-ntc c4 c6 10k"
  - text c.7_7 blue: "R6: thermistor-ptc c7 c9"
  - text c.7_10 blue: "R7: varistor c10 c12 470V"
  - text e.7_1 blue: "D5: schottky e1 e3 1N5819"
  - text e.7_4 blue: "D6: photodiode e4 e6"
  - text e.7_7 blue: "D7: diac e7 e9"
  - text e.7_10 blue: "V3: square e10 e12 5"
  - text g.7_1 blue: "V4: triangle g1 g3 1"
  - text g.7_4 blue: "PV1: solar g4 g6 0.6"
  - text g.7_7 blue: "S2: switch-nc g7 g9"
  - text g.7_10 blue: "S3: button g10 g12"
  - text i.7_1 blue: "S4: button-nc i1 i3"
  - text i.7_4 blue: "S5: reed i4 i6"
  - text i.7_7 blue: "LS1: speaker i7 i9"
  - text i.7_10 blue: "MK1: mic i10 i12"
  - text k.7_1 blue: "A1: ammeter k1 k3"
  - text k.7_4 blue: "V5: voltmeter k4 k6"
  - text k.7_7 blue: "M1: ohmmeter k7 k9"
  - text k.7_10 blue: "W1: wattmeter k10 k12"
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
