# 使える部品

2 端子部品は `ID: 種類 番地 番地 [値]` の 1 行で書く。

```circuit
title: 図01 2 端子部品
parts:
  R1:  resistor b1 b3 10k
  R2:  resistor-var b4 b6 10k
  C1:  capacitor b7 b9 100n
  C2:  ecap b10 b12 100u
  D4:  varicap d1 d3 33p
  L1:  inductor d4 d6 10m
  R3:  photoresistor d7 d9
  R4:  thermistor d10 d12 10k
  R5:  thermistor-ntc f1 f3 10k
  R6:  thermistor-ptc f4 f6
  R7:  varistor f7 f9 470V
  X1:  crystal f10 f12 16M
  D1:  diode h1 h3 1N4148
  D2:  led h4 h6
  D3:  zener h7 h9 5V1
  D5:  schottky h10 h12 1N5819
  D6:  photodiode j1 j3
  D7:  diac j4 j6
  V1:  vsource j7 j9 5
  V2:  sine j10 j12 1
  V3:  square l1 l3 5
  V4:  triangle l4 l6 1
  I1:  isource l7 l9 20m
  B1:  battery l10 l12 9
  PV1: solar n1 n3 0.6
  S1:  switch n4 n6
  S2:  switch-nc n7 n9
  S3:  button n10 n12
  S4:  button-nc p1 p3
  S5:  reed p4 p6
  F1:  fuse p7 p9 3A
  P1:  lamp p10 p12
  LS1: speaker r1 r3
  MK1: mic r4 r6
  A1:  ammeter r7 r9
  V5:  voltmeter r10 r12
  M1:  ohmmeter t1 t3
  W1:  wattmeter t4 t6
  G1:  galvanometer t7 t9
  D8:  detector t10 t12
notes:
  - text a.4_2 blue center: 01 抵抗
  - text b.7_2 blue center: "R1: resistor b1 b3 10k"
  - text a.4_5 blue center: 02 可変抵抗
  - text b.7_5 blue center: "R2: resistor-var b4 b6 10k"
  - text a.4_8 blue center: 04 コンデンサ
  - text b.7_8 blue center: "C1: capacitor b7 b9 100n"
  - text a.4_11 blue center: 05 電解コンデンサ
  - text b.7_11 blue center: "C2: ecap b10 b12 100u"
  - text c.4_2 blue center: 06 バリキャップ
  - text d.7_2 blue center: "D4: varicap d1 d3 33p"
  - text c.4_5 blue center: 07 コイル
  - text d.7_5 blue center: "L1: inductor d4 d6 10m"
  - text c.4_8 blue center: 08 CdS セル
  - text d.7_8 blue center: "R3: photoresistor d7 d9"
  - text c.4_11 blue center: 09 サーミスタ
  - text d.7_11 blue center: "R4: thermistor d10 d12 10k"
  - text e.4_2 blue center: 10 NTC サーミスタ
  - text f.7_2 blue center: "R5: thermistor-ntc f1 f3 10k"
  - text e.4_5 blue center: 11 PTC サーミスタ
  - text f.7_5 blue center: "R6: thermistor-ptc f4 f6"
  - text e.4_8 blue center: 12 バリスタ
  - text f.7_8 blue center: "R7: varistor f7 f9 470V"
  - text e.4_11 blue center: 13 水晶振動子
  - text f.7_11 blue center: "X1: crystal f10 f12 16M"
  - text g.4_2 blue center: 14 ダイオード
  - text h.7_2 blue center: "D1: diode h1 h3 1N4148"
  - text g.4_5 blue center: 15 LED
  - text h.7_5 blue center: "D2: led h4 h6"
  - text g.4_8 blue center: 16 ツェナー
  - text h.7_8 blue center: "D3: zener h7 h9 5V1"
  - text g.4_11 blue center: 17 ショットキー
  - text h.7_11 blue center: "D5: schottky h10 h12 1N5819"
  - text i.4_2 blue center: 18 フォトダイオード
  - text j.7_2 blue center: "D6: photodiode j1 j3"
  - text i.4_5 blue center: 19 ダイアック
  - text j.7_5 blue center: "D7: diac j4 j6"
  - text i.4_8 blue center: 22 直流電源
  - text j.7_8 blue center: "V1: vsource j7 j9 5"
  - text i.4_11 blue center: 23 交流電源
  - text j.7_11 blue center: "V2: sine j10 j12 1"
  - text k.4_2 blue center: 24 方形波電源
  - text l.7_2 blue center: "V3: square l1 l3 5"
  - text k.4_5 blue center: 25 三角波電源
  - text l.7_5 blue center: "V4: triangle l4 l6 1"
  - text k.4_8 blue center: 26 定電流源
  - text l.7_8 blue center: "I1: isource l7 l9 20m"
  - text k.4_11 blue center: 27 電池
  - text l.7_11 blue center: "B1: battery l10 l12 9"
  - text m.4_2 blue center: 28 太陽電池
  - text n.7_2 blue center: "PV1: solar n1 n3 0.6"
  - text m.4_5 blue center: 29 スイッチ
  - text n.7_5 blue center: "S1: switch n4 n6"
  - text m.4_8 blue center: 30 b 接点スイッチ
  - text n.7_8 blue center: "S2: switch-nc n7 n9"
  - text m.4_11 blue center: 31 押しボタン
  - text n.7_11 blue center: "S3: button n10 n12"
  - text o.4_2 blue center: 32 b 接点ボタン
  - text p.7_2 blue center: "S4: button-nc p1 p3"
  - text o.4_5 blue center: 33 リードスイッチ
  - text p.7_5 blue center: "S5: reed p4 p6"
  - text o.4_8 blue center: 34 ヒューズ
  - text p.7_8 blue center: "F1: fuse p7 p9 3A"
  - text o.4_11 blue center: 35 ランプ
  - text p.7_11 blue center: "P1: lamp p10 p12"
  - text q.4_2 blue center: 36 スピーカー
  - text r.7_2 blue center: "LS1: speaker r1 r3"
  - text q.4_5 blue center: 37 マイク
  - text r.7_5 blue center: "MK1: mic r4 r6"
  - text q.4_8 blue center: 38 電流計
  - text r.7_8 blue center: "A1: ammeter r7 r9"
  - text q.4_11 blue center: 39 電圧計
  - text r.7_11 blue center: "V5: voltmeter r10 r12"
  - text s.4_2 blue center: 40 抵抗計
  - text t.7_2 blue center: "M1: ohmmeter t1 t3"
  - text s.4_5 blue center: 41 電力計
  - text t.7_5 blue center: "W1: wattmeter t4 t6"
  - text s.4_8 blue center: 42 検流計
  - text t.7_8 blue center: "G1: galvanometer t7 t9"
  - text s.4_11 blue center: 43 検出器
  - text t.7_11 blue center: "D8: detector t10 t12"
style:
  grid: on
```

値は種類から単位を補う (抵抗の `10k` → 10 kΩ、コイルの `10m` → 10 mH)。
ダイオードやスイッチのように値が型番や定格のものは、書いたとおりに出る。

`ecap` (電解コンデンサ) は先に書いた番地が + 側になる。上の `C2` なら b9 が +
(記号の平らな板のほう。丸い板が - 側)。

`switch` / `button` は a 接点 (ふだん開いている)、`-nc` が付くほうは b 接点。
水晶の値は周波数なので、`16M` と書くと 16 MHz になる。

NTC と PTC のサーミスタは**同じ記号で描き、区別は ID の下に字で書く**。
circuitikz の NTC / PTC の記号は中に θ を持っていて、フェンスの TeX には
その大きさの字形が無く `#` で出るため (`op amp` の ± と同じ壊れ方)。

## 1 端子の記号

`port` (端子) と `ground` のほかに、電源レールの `vcc` / `vee` がある。
`ground` 以外は **ID がそのまま図に出て、乗っているネットの名前にもなる**。

```circuit
title: 図02 1 端子の記号
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
