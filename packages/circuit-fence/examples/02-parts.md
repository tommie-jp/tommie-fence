# 使える部品

2 端子部品は `ID: 種類 番地 番地 [値]` の 1 行で書く。

```circuit
title: 図01 2 端子部品
parts:
  R1:  resistor b2 b4 10k
  R2:  resistor-var b5 b7 10k
  P2:  potentiometer b8 b10 10k
  C1:  capacitor b11 b13 100n
  C2:  ecap d2 d4 100u
  D4:  varicap d5 d7 33p
  L1:  inductor d8 d10 10m
  R3:  photoresistor d11 d13
  R4:  thermistor f2 f4 10k
  R5:  thermistor-ntc f5 f7 10k
  R6:  thermistor-ptc f8 f10
  R7:  varistor f11 f13 470V
  X1:  crystal h2 h4 16M
  D1:  diode h5 h7 1N4148
  D2:  led h8 h10
  D3:  zener h11 h13 5V1
  D5:  schottky j2 j4 1N5819
  D6:  photodiode j5 j7
  D7:  diac j8 j10
  T1:  thyristor j11 j13
  T2:  triac l2 l4
  V1:  vsource l5 l7 5
  V2:  sine l8 l10 1
  V3:  square l11 l13 5
  V4:  triangle n2 n4 1
  I1:  isource n5 n7 20m
  B1:  battery n8 n10 9
  PV1: solar n11 n13 0.6
  S1:  switch p2 p4
  S2:  switch-nc p5 p7
  S3:  button p8 p10
  S4:  button-nc p11 p13
  S5:  reed r2 r4
  F1:  fuse r5 r7 3A
  P1:  lamp r8 r10
  LS1: speaker r11 r13
  MK1: mic t2 t4
  A1:  ammeter t5 t7
  V5:  voltmeter t8 t10
  M1:  ohmmeter t11 t13
  W1:  wattmeter v2 v4
  G1:  galvanometer v5 v7
  D8:  detector v8 v10
notes:
  - line a.1_1.5 a.1_13.5 ink
  - line c.1_1.5 c.1_13.5 ink
  - line e.1_1.5 e.1_13.5 ink
  - line g.1_1.5 g.1_13.5 ink
  - line i.1_1.5 i.1_13.5 ink
  - line k.1_1.5 k.1_13.5 ink
  - line m.1_1.5 m.1_13.5 ink
  - line o.1_1.5 o.1_13.5 ink
  - line q.1_1.5 q.1_13.5 ink
  - line s.1_1.5 s.1_13.5 ink
  - line u.1_1.5 u.1_13.5 ink
  - line w.1_1.5 w.1_13.5 ink
  - line a.1_1.5 w.1_1.5 ink
  - line a.1_4.5 w.1_4.5 ink
  - line a.1_7.5 w.1_7.5 ink
  - line a.1_10.5 w.1_10.5 ink
  - line a.1_13.5 w.1_13.5 ink
  - text a.4_3 blue center: 05 抵抗
  - text b.7_3 blue center: "R1: resistor b2 b4 10k"
  - text a.4_6 blue center: 06 可変抵抗
  - text b.7_6 blue center: "R2: resistor-var b5 b7 10k"
  - text a.4_9 blue center: 07 ポテンショメータ
  - text b.7_9 blue center: "P2: potentiometer b8 b10 10k"
  - text a.4_12 blue center: 08 コンデンサ
  - text b.7_12 blue center: "C1: capacitor b11 b13 100n"
  - text c.4_3 blue center: 09 電解コンデンサ
  - text d.7_3 blue center: "C2: ecap d2 d4 100u"
  - text c.4_6 blue center: 10 バリキャップ
  - text d.7_6 blue center: "D4: varicap d5 d7 33p"
  - text c.4_9 blue center: 11 コイル
  - text d.7_9 blue center: "L1: inductor d8 d10 10m"
  - text c.4_12 blue center: 12 CdS セル
  - text d.7_12 blue center: "R3: photoresistor d11 d13"
  - text e.4_3 blue center: 13 サーミスタ
  - text f.7_3 blue center: "R4: thermistor f2 f4 10k"
  - text e.4_6 blue center: 14 NTC サーミスタ
  - text f.7_6 blue center: "R5: thermistor-ntc f5 f7 10k"
  - text e.4_9 blue center: 15 PTC サーミスタ
  - text f.7_9 blue center: "R6: thermistor-ptc f8 f10"
  - text e.4_12 blue center: 16 バリスタ
  - text f.7_12 blue center: "R7: varistor f11 f13 470V"
  - text g.4_3 blue center: 17 水晶振動子
  - text h.7_3 blue center: "X1: crystal h2 h4 16M"
  - text g.4_6 blue center: 18 ダイオード
  - text h.7_6 blue center: "D1: diode h5 h7 1N4148"
  - text g.4_9 blue center: 19 LED
  - text h.7_9 blue center: "D2: led h8 h10"
  - text g.4_12 blue center: 20 ツェナー
  - text h.7_12 blue center: "D3: zener h11 h13 5V1"
  - text i.4_3 blue center: 21 ショットキー
  - text j.7_3 blue center: "D5: schottky j2 j4 1N5819"
  - text i.4_6 blue center: 22 フォトダイオード
  - text j.7_6 blue center: "D6: photodiode j5 j7"
  - text i.4_9 blue center: 23 ダイアック
  - text j.7_9 blue center: "D7: diac j8 j10"
  - text i.4_12 blue center: 24 サイリスタ
  - text j.7_12 blue center: "T1: thyristor j11 j13"
  - text k.4_3 blue center: 25 トライアック
  - text l.7_3 blue center: "T2: triac l2 l4"
  - text k.4_6 blue center: 26 直流電源
  - text l.7_6 blue center: "V1: vsource l5 l7 5"
  - text k.4_9 blue center: 27 交流電源
  - text l.7_9 blue center: "V2: sine l8 l10 1"
  - text k.4_12 blue center: 28 方形波電源
  - text l.7_12 blue center: "V3: square l11 l13 5"
  - text m.4_3 blue center: 29 三角波電源
  - text n.7_3 blue center: "V4: triangle n2 n4 1"
  - text m.4_6 blue center: 30 定電流源
  - text n.7_6 blue center: "I1: isource n5 n7 20m"
  - text m.4_9 blue center: 31 電池
  - text n.7_9 blue center: "B1: battery n8 n10 9"
  - text m.4_12 blue center: 32 太陽電池
  - text n.7_12 blue center: "PV1: solar n11 n13 0.6"
  - text o.4_3 blue center: 33 スイッチ
  - text p.7_3 blue center: "S1: switch p2 p4"
  - text o.4_6 blue center: 34 b 接点スイッチ
  - text p.7_6 blue center: "S2: switch-nc p5 p7"
  - text o.4_9 blue center: 35 押しボタン
  - text p.7_9 blue center: "S3: button p8 p10"
  - text o.4_12 blue center: 36 b 接点ボタン
  - text p.7_12 blue center: "S4: button-nc p11 p13"
  - text q.4_3 blue center: 37 リードスイッチ
  - text r.7_3 blue center: "S5: reed r2 r4"
  - text q.4_6 blue center: 38 ヒューズ
  - text r.7_6 blue center: "F1: fuse r5 r7 3A"
  - text q.4_9 blue center: 39 ランプ
  - text r.7_9 blue center: "P1: lamp r8 r10"
  - text q.4_12 blue center: 40 スピーカー
  - text r.7_12 blue center: "LS1: speaker r11 r13"
  - text s.4_3 blue center: 41 マイク
  - text t.7_3 blue center: "MK1: mic t2 t4"
  - text s.4_6 blue center: 42 電流計
  - text t.7_6 blue center: "A1: ammeter t5 t7"
  - text s.4_9 blue center: 43 電圧計
  - text t.7_9 blue center: "V5: voltmeter t8 t10"
  - text s.4_12 blue center: 44 抵抗計
  - text t.7_12 blue center: "M1: ohmmeter t11 t13"
  - text u.4_3 blue center: 45 電力計
  - text v.7_3 blue center: "W1: wattmeter v2 v4"
  - text u.4_6 blue center: 46 検流計
  - text v.7_6 blue center: "G1: galvanometer v5 v7"
  - text u.4_9 blue center: 47 検出器
  - text v.7_9 blue center: "D8: detector v8 v10"
style:
  grid: off
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
  IN:  port b3
  G1:  ground b6
  VCC: vcc b9
  VEE: vee b12
notes:
  - line a.1_1.5 a.1_13.5 ink
  - line c.1_1.5 c.1_13.5 ink
  - line a.1_1.5 c.1_1.5 ink
  - line a.1_4.5 c.1_4.5 ink
  - line a.1_7.5 c.1_7.5 ink
  - line a.1_10.5 c.1_10.5 ink
  - line a.1_13.5 c.1_13.5 ink
  - text a.4_3 blue center: 01 端子
  - text b.7_3 blue center: "IN: port b3"
  - text a.4_6 blue center: 02 グラウンド
  - text b.7_6 blue center: "G1: ground b6"
  - text a.4_9 blue center: 03 電源レール (+)
  - text b.7_9 blue center: "VCC: vcc b9"
  - text a.4_12 blue center: 04 電源レール (-)
  - text b.7_12 blue center: "VEE: vee b12"
style:
  grid: off
```

グラウンドは離して描いても同じ節点になるが、**電源レールはならない**
(5V と 3V3 を同じネットにしてしまうため)。つなぐなら配線を引く。
