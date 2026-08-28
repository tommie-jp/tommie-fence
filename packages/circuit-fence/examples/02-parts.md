# 使える部品

2 端子部品は `ID: 種類 番地 番地 [値]` の 1 行で書く。

```circuit
title: 図01 2 端子部品
parts:
  R1:  resistor b1 b3 10k
  R2:  resistor-var b4 b6 10k
  P2:  potentiometer b7 b9 10k
  C1:  capacitor b10 b12 100n
  C2:  ecap b13 b15 100u
  D4:  varicap b16 b18 33p
  L1:  inductor e1 e3 10m
  R3:  photoresistor e4 e6
  R4:  thermistor e7 e9 10k
  R5:  thermistor-ntc e10 e12 10k
  R6:  thermistor-ptc e13 e15
  R7:  varistor e16 e18 470V
  X1:  crystal h1 h3 16M
  D1:  diode h4 h6 1N4148
  D2:  led h7 h9
  D3:  zener h10 h12 5V1
  D5:  schottky h13 h15 1N5819
  D6:  photodiode h16 h18
  D7:  diac k1 k3
  T1:  thyristor k4 k6
  T2:  triac k7 k9
  V1:  vsource k10 k12 5
  V2:  sine k13 k15 1
  V3:  square k16 k18 5
  V4:  triangle n1 n3 1
  I1:  isource n4 n6 20m
  B1:  battery n7 n9 9
  PV1: solar n10 n12 0.6
  S1:  switch n13 n15
  S2:  switch-nc n16 n18
  S3:  button q1 q3
  S4:  button-nc q4 q6
  S5:  reed q7 q9
  F1:  fuse q10 q12 3A
  P1:  lamp q13 q15
  LS1: speaker q16 q18
  MK1: mic t1 t3
  A1:  ammeter t4 t6
  V5:  voltmeter t7 t9
  M1:  ohmmeter t10 t12
  W1:  wattmeter t13 t15
  G1:  galvanometer t16 t18
  D8:  detector w1 w3
notes:
  - box a.3_1 b.9_3 ink solid
  - text a.4_2 blue center: 05 抵抗
  - text b.7_2 blue center: "R1: resistor b1 b3 10k"
  - box a.3_4 b.9_6 ink solid
  - text a.4_5 blue center: 06 可変抵抗
  - text b.7_5 blue center: "R2: resistor-var b4 b6 10k"
  - box a.3_7 b.9_9 ink solid
  - text a.4_8 blue center: 07 ポテンショメータ
  - text b.7_8 blue center: "P2: potentiometer b7 b9 10k"
  - box a.3_10 b.9_12 ink solid
  - text a.4_11 blue center: 08 コンデンサ
  - text b.7_11 blue center: "C1: capacitor b10 b12 100n"
  - box a.3_13 b.9_15 ink solid
  - text a.4_14 blue center: 09 電解コンデンサ
  - text b.7_14 blue center: "C2: ecap b13 b15 100u"
  - box a.3_16 b.9_18 ink solid
  - text a.4_17 blue center: 10 バリキャップ
  - text b.7_17 blue center: "D4: varicap b16 b18 33p"
  - box d.3_1 e.9_3 ink solid
  - text d.4_2 blue center: 11 コイル
  - text e.7_2 blue center: "L1: inductor e1 e3 10m"
  - box d.3_4 e.9_6 ink solid
  - text d.4_5 blue center: 12 CdS セル
  - text e.7_5 blue center: "R3: photoresistor e4 e6"
  - box d.3_7 e.9_9 ink solid
  - text d.4_8 blue center: 13 サーミスタ
  - text e.7_8 blue center: "R4: thermistor e7 e9 10k"
  - box d.3_10 e.9_12 ink solid
  - text d.4_11 blue center: 14 NTC サーミスタ
  - text e.7_11 blue center: "R5: thermistor-ntc e10 e12 10k"
  - box d.3_13 e.9_15 ink solid
  - text d.4_14 blue center: 15 PTC サーミスタ
  - text e.7_14 blue center: "R6: thermistor-ptc e13 e15"
  - box d.3_16 e.9_18 ink solid
  - text d.4_17 blue center: 16 バリスタ
  - text e.7_17 blue center: "R7: varistor e16 e18 470V"
  - box g.3_1 h.9_3 ink solid
  - text g.4_2 blue center: 17 水晶振動子
  - text h.7_2 blue center: "X1: crystal h1 h3 16M"
  - box g.3_4 h.9_6 ink solid
  - text g.4_5 blue center: 18 ダイオード
  - text h.7_5 blue center: "D1: diode h4 h6 1N4148"
  - box g.3_7 h.9_9 ink solid
  - text g.4_8 blue center: 19 LED
  - text h.7_8 blue center: "D2: led h7 h9"
  - box g.3_10 h.9_12 ink solid
  - text g.4_11 blue center: 20 ツェナー
  - text h.7_11 blue center: "D3: zener h10 h12 5V1"
  - box g.3_13 h.9_15 ink solid
  - text g.4_14 blue center: 21 ショットキー
  - text h.7_14 blue center: "D5: schottky h13 h15 1N5819"
  - box g.3_16 h.9_18 ink solid
  - text g.4_17 blue center: 22 フォトダイオード
  - text h.7_17 blue center: "D6: photodiode h16 h18"
  - box j.3_1 k.9_3 ink solid
  - text j.4_2 blue center: 23 ダイアック
  - text k.7_2 blue center: "D7: diac k1 k3"
  - box j.3_4 k.9_6 ink solid
  - text j.4_5 blue center: 24 サイリスタ
  - text k.7_5 blue center: "T1: thyristor k4 k6"
  - box j.3_7 k.9_9 ink solid
  - text j.4_8 blue center: 25 トライアック
  - text k.7_8 blue center: "T2: triac k7 k9"
  - box j.3_10 k.9_12 ink solid
  - text j.4_11 blue center: 26 直流電源
  - text k.7_11 blue center: "V1: vsource k10 k12 5"
  - box j.3_13 k.9_15 ink solid
  - text j.4_14 blue center: 27 交流電源
  - text k.7_14 blue center: "V2: sine k13 k15 1"
  - box j.3_16 k.9_18 ink solid
  - text j.4_17 blue center: 28 方形波電源
  - text k.7_17 blue center: "V3: square k16 k18 5"
  - box m.3_1 n.9_3 ink solid
  - text m.4_2 blue center: 29 三角波電源
  - text n.7_2 blue center: "V4: triangle n1 n3 1"
  - box m.3_4 n.9_6 ink solid
  - text m.4_5 blue center: 30 定電流源
  - text n.7_5 blue center: "I1: isource n4 n6 20m"
  - box m.3_7 n.9_9 ink solid
  - text m.4_8 blue center: 31 電池
  - text n.7_8 blue center: "B1: battery n7 n9 9"
  - box m.3_10 n.9_12 ink solid
  - text m.4_11 blue center: 32 太陽電池
  - text n.7_11 blue center: "PV1: solar n10 n12 0.6"
  - box m.3_13 n.9_15 ink solid
  - text m.4_14 blue center: 33 スイッチ
  - text n.7_14 blue center: "S1: switch n13 n15"
  - box m.3_16 n.9_18 ink solid
  - text m.4_17 blue center: 34 b 接点スイッチ
  - text n.7_17 blue center: "S2: switch-nc n16 n18"
  - box p.3_1 q.9_3 ink solid
  - text p.4_2 blue center: 35 押しボタン
  - text q.7_2 blue center: "S3: button q1 q3"
  - box p.3_4 q.9_6 ink solid
  - text p.4_5 blue center: 36 b 接点ボタン
  - text q.7_5 blue center: "S4: button-nc q4 q6"
  - box p.3_7 q.9_9 ink solid
  - text p.4_8 blue center: 37 リードスイッチ
  - text q.7_8 blue center: "S5: reed q7 q9"
  - box p.3_10 q.9_12 ink solid
  - text p.4_11 blue center: 38 ヒューズ
  - text q.7_11 blue center: "F1: fuse q10 q12 3A"
  - box p.3_13 q.9_15 ink solid
  - text p.4_14 blue center: 39 ランプ
  - text q.7_14 blue center: "P1: lamp q13 q15"
  - box p.3_16 q.9_18 ink solid
  - text p.4_17 blue center: 40 スピーカー
  - text q.7_17 blue center: "LS1: speaker q16 q18"
  - box s.3_1 t.9_3 ink solid
  - text s.4_2 blue center: 41 マイク
  - text t.7_2 blue center: "MK1: mic t1 t3"
  - box s.3_4 t.9_6 ink solid
  - text s.4_5 blue center: 42 電流計
  - text t.7_5 blue center: "A1: ammeter t4 t6"
  - box s.3_7 t.9_9 ink solid
  - text s.4_8 blue center: 43 電圧計
  - text t.7_8 blue center: "V5: voltmeter t7 t9"
  - box s.3_10 t.9_12 ink solid
  - text s.4_11 blue center: 44 抵抗計
  - text t.7_11 blue center: "M1: ohmmeter t10 t12"
  - box s.3_13 t.9_15 ink solid
  - text s.4_14 blue center: 45 電力計
  - text t.7_14 blue center: "W1: wattmeter t13 t15"
  - box s.3_16 t.9_18 ink solid
  - text s.4_17 blue center: 46 検流計
  - text t.7_17 blue center: "G1: galvanometer t16 t18"
  - box v.3_1 w.9_3 ink solid
  - text v.4_2 blue center: 47 検出器
  - text w.7_2 blue center: "D8: detector w1 w3"
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
  IN:  port b1
  G1:  ground b3
  VCC: vcc b5
  VEE: vee b7
notes:
  - text a.4_1 blue center: 01 端子
  - text b.7_1 blue center: "IN: port b1"
  - text a.4_3 blue center: 02 グラウンド
  - text b.7_3 blue center: "G1: ground b3"
  - text a.4_5 blue center: 03 電源レール (+)
  - text b.7_5 blue center: "VCC: vcc b5"
  - text a.4_7 blue center: 04 電源レール (-)
  - text b.7_7 blue center: "VEE: vee b7"
style:
  grid: on
```

グラウンドは離して描いても同じ節点になるが、**電源レールはならない**
(5V と 3V3 を同じネットにしてしまうため)。つなぐなら配線を引く。
