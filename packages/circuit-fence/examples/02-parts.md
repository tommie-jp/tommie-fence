# 使える部品

2 端子部品は `ID: 種類 番地 番地 [値]` の 1 行で書く。

```circuit
title: 図01 使える部品
parts:
  R1: resistor b1 b3 10k
  C1: capacitor b4 b6 100n
  C2: ecap b7 b9 100u
  L1: inductor b10 b12 10m
  D1: diode d1 d3 1N4148
  D2: led d4 d6
  D3: zener d7 d9 5V1
  V1: vsource f1 f3 5
  V2: sine f4 f6 1
  I1: isource f7 f9 20m
  B1: battery h1 h3 9
  S1: switch h4 h6
  F1: fuse h7 h9 3A
  P1: lamp j1 j3
notes:
  - text a.5_2 blue center: 抵抗
  - text b.7_2 blue center: "R1: resistor b1 b3 10k"
  - text a.5_5 blue center: コンデンサ
  - text b.7_5 blue center: "C1: capacitor b4 b6 100n"
  - text a.5_8 blue center: 電解コンデンサ
  - text b.7_8 blue center: "C2: ecap b7 b9 100u"
  - text a.5_11 blue center: コイル
  - text b.7_11 blue center: "L1: inductor b10 b12 10m"
  - text c.5_2 blue center: ダイオード
  - text d.7_2 blue center: "D1: diode d1 d3 1N4148"
  - text c.5_5 blue center: LED
  - text d.7_5 blue center: "D2: led d4 d6"
  - text c.5_8 blue center: ツェナー
  - text d.7_8 blue center: "D3: zener d7 d9 5V1"
  - text e.5_2 blue center: 直流電源
  - text f.7_2 blue center: "V1: vsource f1 f3 5"
  - text e.5_5 blue center: 交流電源
  - text f.7_5 blue center: "V2: sine f4 f6 1"
  - text e.5_8 blue center: 定電流源
  - text f.7_8 blue center: "I1: isource f7 f9 20m"
  - text g.5_2 blue center: 電池
  - text h.7_2 blue center: "B1: battery h1 h3 9"
  - text g.5_5 blue center: スイッチ
  - text h.7_5 blue center: "S1: switch h4 h6"
  - text g.5_8 blue center: ヒューズ
  - text h.7_8 blue center: "F1: fuse h7 h9 3A"
  - text i.5_2 blue center: ランプ
  - text j.7_2 blue center: "P1: lamp j1 j3"
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
  R2:  resistor-var b1 b3 10k
  D4:  varicap b4 b6 33p
  X1:  crystal b7 b9 16M
  R3:  photoresistor b10 b12
  R4:  thermistor d1 d3 10k
  R5:  thermistor-ntc d4 d6 10k
  R6:  thermistor-ptc d7 d9
  R7:  varistor d10 d12 470V
  D5:  schottky f1 f3 1N5819
  D6:  photodiode f4 f6
  D7:  diac f7 f9
  V3:  square f10 f12 5
  V4:  triangle h1 h3 1
  PV1: solar h4 h6 0.6
  S2:  switch-nc h7 h9
  S3:  button h10 h12
  S4:  button-nc j1 j3
  S5:  reed j4 j6
  LS1: speaker j7 j9
  MK1: mic j10 j12
  A1:  ammeter l1 l3
  V5:  voltmeter l4 l6
  M1:  ohmmeter l7 l9
  W1:  wattmeter l10 l12
  G1:  galvanometer n1 n3
  D8:  detector n4 n6
notes:
  - text a.5_2 blue center: 可変抵抗
  - text b.7_2 blue center: "R2: resistor-var b1 b3 10k"
  - text a.5_5 blue center: バリキャップ
  - text b.7_5 blue center: "D4: varicap b4 b6 33p"
  - text a.5_8 blue center: 水晶振動子
  - text b.7_8 blue center: "X1: crystal b7 b9 16M"
  - text a.5_11 blue center: CdS セル
  - text b.7_11 blue center: "R3: photoresistor b10 b12"
  - text c.5_2 blue center: サーミスタ
  - text d.7_2 blue center: "R4: thermistor d1 d3 10k"
  - text c.5_5 blue center: NTC サーミスタ
  - text d.7_5 blue center: "R5: thermistor-ntc d4 d6 10k"
  - text c.5_8 blue center: PTC サーミスタ
  - text d.7_8 blue center: "R6: thermistor-ptc d7 d9"
  - text c.5_11 blue center: バリスタ
  - text d.7_11 blue center: "R7: varistor d10 d12 470V"
  - text e.5_2 blue center: ショットキー
  - text f.7_2 blue center: "D5: schottky f1 f3 1N5819"
  - text e.5_5 blue center: フォトダイオード
  - text f.7_5 blue center: "D6: photodiode f4 f6"
  - text e.5_8 blue center: ダイアック
  - text f.7_8 blue center: "D7: diac f7 f9"
  - text e.5_11 blue center: 方形波電源
  - text f.7_11 blue center: "V3: square f10 f12 5"
  - text g.5_2 blue center: 三角波電源
  - text h.7_2 blue center: "V4: triangle h1 h3 1"
  - text g.5_5 blue center: 太陽電池
  - text h.7_5 blue center: "PV1: solar h4 h6 0.6"
  - text g.5_8 blue center: b 接点スイッチ
  - text h.7_8 blue center: "S2: switch-nc h7 h9"
  - text g.5_11 blue center: 押しボタン
  - text h.7_11 blue center: "S3: button h10 h12"
  - text i.5_2 blue center: b 接点ボタン
  - text j.7_2 blue center: "S4: button-nc j1 j3"
  - text i.5_5 blue center: リードスイッチ
  - text j.7_5 blue center: "S5: reed j4 j6"
  - text i.5_8 blue center: スピーカー
  - text j.7_8 blue center: "LS1: speaker j7 j9"
  - text i.5_11 blue center: マイク
  - text j.7_11 blue center: "MK1: mic j10 j12"
  - text k.5_2 blue center: 電流計
  - text l.7_2 blue center: "A1: ammeter l1 l3"
  - text k.5_5 blue center: 電圧計
  - text l.7_5 blue center: "V5: voltmeter l4 l6"
  - text k.5_8 blue center: 抵抗計
  - text l.7_8 blue center: "M1: ohmmeter l7 l9"
  - text k.5_11 blue center: 電力計
  - text l.7_11 blue center: "W1: wattmeter l10 l12"
  - text m.5_2 blue center: 検流計
  - text n.7_2 blue center: "G1: galvanometer n1 n3"
  - text m.5_5 blue center: 検出器
  - text n.7_5 blue center: "D8: detector n4 n6"
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
