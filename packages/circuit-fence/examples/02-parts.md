# 使える部品

2 端子部品は `ID: 種類 番地 番地 [値]` の 1 行で書く。

```circuit
title: 図01 使える部品
parts:
  R1: resistor a1 a3 10k
  C1: capacitor a5 a7 100n
  C2: ecap a9 a11 100u
  L1: inductor a13 a15 10m
  D1: diode c1 c3 1N4148
  D2: led c5 c7
  D3: zener c9 c11 5V1
  V1: vsource e1 e3 5
  V2: sine e5 e7 1
  I1: isource e9 e11 20m
  B1: battery g1 g3 9
  S1: switch g5 g7
  F1: fuse g9 g11 3A
  P1: lamp i1 i3
notes:
  - text b1 blue: "R1: resistor a1 a3 10k"
  - text b5 blue: "C1: capacitor a5 a7 100n"
  - text b9 blue: "C2: ecap a9 a11 100u"
  - text b13 blue: "L1: inductor a13 a15 10m"
  - text d1 blue: "D1: diode c1 c3 1N4148"
  - text d5 blue: "D2: led c5 c7"
  - text d9 blue: "D3: zener c9 c11 5V1"
  - text f1 blue: "V1: vsource e1 e3 5"
  - text f5 blue: "V2: sine e5 e7 1"
  - text f9 blue: "I1: isource e9 e11 20m"
  - text h1 blue: "B1: battery g1 g3 9"
  - text h5 blue: "S1: switch g5 g7"
  - text h9 blue: "F1: fuse g9 g11 3A"
  - text j1 blue: "P1: lamp i1 i3"
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
  D4:  varicap a5 a7 33p
  X1:  crystal a9 a11 16M
  R3:  photoresistor a13 a15
  R4:  thermistor c1 c3 10k
  R5:  thermistor-ntc c5 c7 10k
  R6:  thermistor-ptc c9 c11
  R7:  varistor c13 c15 470V
  D5:  schottky e1 e3 1N5819
  D6:  photodiode e5 e7
  D7:  diac e9 e11
  V3:  square e13 e15 5
  V4:  triangle g1 g3 1
  PV1: solar g5 g7 0.6
  S2:  switch-nc g9 g11
  S3:  button g13 g15
  S4:  button-nc i1 i3
  S5:  reed i5 i7
  LS1: speaker i9 i11
  MK1: mic i13 i15
  A1:  ammeter k1 k3
  V5:  voltmeter k5 k7
  M1:  ohmmeter k9 k11
notes:
  - text b1 blue: "R2: resistor-var a1 a3 10k"
  - text b5 blue: "D4: varicap a5 a7 33p"
  - text b9 blue: "X1: crystal a9 a11 16M"
  - text b13 blue: "R3: photoresistor a13 a15"
  - text d1 blue: "R4: thermistor c1 c3 10k"
  - text d5 blue: "R5: thermistor-ntc c5 c7 10k"
  - text d9 blue: "R6: thermistor-ptc c9 c11"
  - text d13 blue: "R7: varistor c13 c15 470V"
  - text f1 blue: "D5: schottky e1 e3 1N5819"
  - text f5 blue: "D6: photodiode e5 e7"
  - text f9 blue: "D7: diac e9 e11"
  - text f13 blue: "V3: square e13 e15 5"
  - text h1 blue: "V4: triangle g1 g3 1"
  - text h5 blue: "PV1: solar g5 g7 0.6"
  - text h9 blue: "S2: switch-nc g9 g11"
  - text h13 blue: "S3: button g13 g15"
  - text j1 blue: "S4: button-nc i1 i3"
  - text j5 blue: "S5: reed i5 i7"
  - text j9 blue: "LS1: speaker i9 i11"
  - text j13 blue: "MK1: mic i13 i15"
  - text l1 blue: "A1: ammeter k1 k3"
  - text l5 blue: "V5: voltmeter k5 k7"
  - text l9 blue: "M1: ohmmeter k9 k11"
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
  VEE: vee a4
  G1:  ground a7
  IN:  port a10
notes:
  - text b1 blue: "VCC: vcc a1"
  - text b4 blue: "VEE: vee a4"
  - text b7 blue: "G1: ground a7"
  - text b10 blue: "IN: port a10"
style:
  grid: on
```

グラウンドは離して描いても同じ節点になるが、**電源レールはならない**
(5V と 3V3 を同じネットにしてしまうため)。つなぐなら配線を引く。
