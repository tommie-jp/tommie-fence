# 使える部品

2 端子部品は `ID: 種類 番地 番地 [値]` の 1 行で書く。

```circuit
title: 図01 2 端子部品
parts:
  R1:  resistor b1 b3 10k
  R2:  resistor-var b4 b6 10k
  P2: potentiometer b7 b9 10k
  C1:  capacitor b10 b12 100n
  C2:  ecap d1 d3 100u
  D4:  varicap d4 d6 33p
  L1:  inductor d7 d9 10m
  R3:  photoresistor d10 d12
  R4:  thermistor f1 f3 10k
  R5:  thermistor-ntc f4 f6 10k
  R6:  thermistor-ptc f7 f9
  R7:  varistor f10 f12 470V
  X1:  crystal h1 h3 16M
  D1:  diode h4 h6 1N4148
  D2:  led h7 h9
  D3:  zener h10 h12 5V1
  D5:  schottky j1 j3 1N5819
  D6:  photodiode j4 j6
  D7:  diac j7 j9
  T1:  thyristor j10 j12
  T2:  triac l1 l3
  V1:  vsource l4 l6 5
  V2:  sine l7 l9 1
  V3:  square l10 l12 5
  V4:  triangle n1 n3 1
  I1:  isource n4 n6 20m
  B1:  battery n7 n9 9
  PV1: solar n10 n12 0.6
  S1:  switch p1 p3
  S2:  switch-nc p4 p6
  S3:  button p7 p9
  S4:  button-nc p10 p12
  S5:  reed r1 r3
  F1:  fuse r4 r6 3A
  P1:  lamp r7 r9
  LS1: speaker r10 r12
  MK1: mic t1 t3
  A1:  ammeter t4 t6
  V5:  voltmeter t7 t9
  M1:  ohmmeter t10 t12
  W1:  wattmeter v1 v3
  G1:  galvanometer v4 v6
  D8:  detector v7 v9
notes:
  - text a.4_2 blue center: 05 抵抗
  - text b.7_2 blue center: "R1: resistor b1 b3 10k"
  - text a.4_5 blue center: 06 可変抵抗
  - text b.7_5 blue center: "R2: resistor-var b4 b6 10k"
  - text a.4_8 blue center: 07 ポテンショメータ
  - text b.7_8 blue center: "P2: potentiometer b7 b9 10k"
  - text a.4_11 blue center: 08 コンデンサ
  - text b.7_11 blue center: "C1: capacitor b10 b12 100n"
  - text c.4_2 blue center: 09 電解コンデンサ
  - text d.7_2 blue center: "C2: ecap d1 d3 100u"
  - text c.4_5 blue center: 10 バリキャップ
  - text d.7_5 blue center: "D4: varicap d4 d6 33p"
  - text c.4_8 blue center: 11 コイル
  - text d.7_8 blue center: "L1: inductor d7 d9 10m"
  - text c.4_11 blue center: 12 CdS セル
  - text d.7_11 blue center: "R3: photoresistor d10 d12"
  - text e.4_2 blue center: 13 サーミスタ
  - text f.7_2 blue center: "R4: thermistor f1 f3 10k"
  - text e.4_5 blue center: 14 NTC サーミスタ
  - text f.7_5 blue center: "R5: thermistor-ntc f4 f6 10k"
  - text e.4_8 blue center: 15 PTC サーミスタ
  - text f.7_8 blue center: "R6: thermistor-ptc f7 f9"
  - text e.4_11 blue center: 16 バリスタ
  - text f.7_11 blue center: "R7: varistor f10 f12 470V"
  - text g.4_2 blue center: 17 水晶振動子
  - text h.7_2 blue center: "X1: crystal h1 h3 16M"
  - text g.4_5 blue center: 18 ダイオード
  - text h.7_5 blue center: "D1: diode h4 h6 1N4148"
  - text g.4_8 blue center: 19 LED
  - text h.7_8 blue center: "D2: led h7 h9"
  - text g.4_11 blue center: 20 ツェナー
  - text h.7_11 blue center: "D3: zener h10 h12 5V1"
  - text i.4_2 blue center: 21 ショットキー
  - text j.7_2 blue center: "D5: schottky j1 j3 1N5819"
  - text i.4_5 blue center: 22 フォトダイオード
  - text j.7_5 blue center: "D6: photodiode j4 j6"
  - text i.4_8 blue center: 23 ダイアック
  - text j.7_8 blue center: "D7: diac j7 j9"
  - text i.4_11 blue center: 24 サイリスタ
  - text j.7_11 blue center: "T1: thyristor j10 j12"
  - text k.4_2 blue center: 25 トライアック
  - text l.7_2 blue center: "T2: triac l1 l3"
  - text k.4_5 blue center: 26 直流電源
  - text l.7_5 blue center: "V1: vsource l4 l6 5"
  - text k.4_8 blue center: 27 交流電源
  - text l.7_8 blue center: "V2: sine l7 l9 1"
  - text k.4_11 blue center: 28 方形波電源
  - text l.7_11 blue center: "V3: square l10 l12 5"
  - text m.4_2 blue center: 29 三角波電源
  - text n.7_2 blue center: "V4: triangle n1 n3 1"
  - text m.4_5 blue center: 30 定電流源
  - text n.7_5 blue center: "I1: isource n4 n6 20m"
  - text m.4_8 blue center: 31 電池
  - text n.7_8 blue center: "B1: battery n7 n9 9"
  - text m.4_11 blue center: 32 太陽電池
  - text n.7_11 blue center: "PV1: solar n10 n12 0.6"
  - text o.4_2 blue center: 33 スイッチ
  - text p.7_2 blue center: "S1: switch p1 p3"
  - text o.4_5 blue center: 34 b 接点スイッチ
  - text p.7_5 blue center: "S2: switch-nc p4 p6"
  - text o.4_8 blue center: 35 押しボタン
  - text p.7_8 blue center: "S3: button p7 p9"
  - text o.4_11 blue center: 36 b 接点ボタン
  - text p.7_11 blue center: "S4: button-nc p10 p12"
  - text q.4_2 blue center: 37 リードスイッチ
  - text r.7_2 blue center: "S5: reed r1 r3"
  - text q.4_5 blue center: 38 ヒューズ
  - text r.7_5 blue center: "F1: fuse r4 r6 3A"
  - text q.4_8 blue center: 39 ランプ
  - text r.7_8 blue center: "P1: lamp r7 r9"
  - text q.4_11 blue center: 40 スピーカー
  - text r.7_11 blue center: "LS1: speaker r10 r12"
  - text s.4_2 blue center: 41 マイク
  - text t.7_2 blue center: "MK1: mic t1 t3"
  - text s.4_5 blue center: 42 電流計
  - text t.7_5 blue center: "A1: ammeter t4 t6"
  - text s.4_8 blue center: 43 電圧計
  - text t.7_8 blue center: "V5: voltmeter t7 t9"
  - text s.4_11 blue center: 44 抵抗計
  - text t.7_11 blue center: "M1: ohmmeter t10 t12"
  - text u.4_2 blue center: 45 電力計
  - text v.7_2 blue center: "W1: wattmeter v1 v3"
  - text u.4_5 blue center: 46 検流計
  - text v.7_5 blue center: "G1: galvanometer v4 v6"
  - text u.4_8 blue center: 47 検出器
  - text v.7_8 blue center: "D8: detector v7 v9"
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
