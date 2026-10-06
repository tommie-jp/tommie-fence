# 使える部品

2 端子部品は `ID: 種類 番地 番地 [値]` の 1 行で書く。

```circuit
title: 図01 2 端子部品
parts:
  R1:  resistor 2,2 4,2 10k
  R2:  resistor-var 5,2 7,2 10k
  P2:  potentiometer 8,2 10,2 10k
  C1:  capacitor 11,2 13,2 100n
  C2:  ecap 2,4 4,4 100u
  D4:  varicap 5,4 7,4 33p
  L1:  inductor 8,4 10,4 10m
  R3:  photoresistor 11,4 13,4
  R4:  thermistor 2,6 4,6 10k
  R5:  thermistor-ntc 5,6 7,6 10k
  R6:  thermistor-ptc 8,6 10,6
  R7:  varistor 11,6 13,6 470V
  X1:  crystal 2,8 4,8 16M
  D1:  diode 5,8 7,8 1N4148
  D2:  led 8,8 10,8
  D3:  zener 11,8 13,8 5V1
  D5:  schottky 2,10 4,10 1N5819
  D6:  photodiode 5,10 7,10
  D7:  diac 8,10 10,10
  T1:  thyristor 11,10 13,10
  T2:  triac 2,12 4,12
  V1:  vsource 5,12 7,12 5
  V2:  sine 8,12 10,12 1
  V3:  square 11,12 13,12 5
  V4:  triangle 2,14 4,14 1
  I1:  isource 5,14 7,14 20m
  B1:  battery 8,14 10,14 9
  PV1: solar 11,14 13,14 0.6
  S1:  switch 2,16 4,16
  S2:  switch-nc 5,16 7,16
  S3:  button 8,16 10,16
  S4:  button-nc 11,16 13,16
  S5:  reed 2,18 4,18
  F1:  fuse 5,18 7,18 3A
  P1:  lamp 8,18 10,18
  LS1: speaker 11,18 13,18
  MK1: mic 2,20 4,20
  A1:  ammeter 5,20 7,20
  V5:  voltmeter 8,20 10,20
  M1:  ohmmeter 11,20 13,20
  W1:  wattmeter 2,22 4,22
  G1:  galvanometer 5,22 7,22
  D8:  detector 8,22 10,22
notes:
  - line 1.5,1.1 13.5,1.1 ink
  - line 1.5,3.1 13.5,3.1 ink
  - line 1.5,5.1 13.5,5.1 ink
  - line 1.5,7.1 13.5,7.1 ink
  - line 1.5,9.1 13.5,9.1 ink
  - line 1.5,11.1 13.5,11.1 ink
  - line 1.5,13.1 13.5,13.1 ink
  - line 1.5,15.1 13.5,15.1 ink
  - line 1.5,17.1 13.5,17.1 ink
  - line 1.5,19.1 13.5,19.1 ink
  - line 1.5,21.1 13.5,21.1 ink
  - line 1.5,23.1 13.5,23.1 ink
  - line 1.5,1.1 1.5,23.1 ink
  - line 4.5,1.1 4.5,23.1 ink
  - line 7.5,1.1 7.5,23.1 ink
  - line 10.5,1.1 10.5,23.1 ink
  - line 13.5,1.1 13.5,23.1 ink
  - text 3,1.4 blue center: 05 抵抗
  - text 3,2.7 blue center: "R1: resistor b2 b4 10k"
  - text 6,1.4 blue center: 06 可変抵抗
  - text 6,2.7 blue center: "R2: resistor-var b5 b7 10k"
  - text 9,1.4 blue center: 07 ポテンショメータ
  - text 9,2.7 blue center: "P2: potentiometer b8 b10 10k"
  - text 12,1.4 blue center: 08 コンデンサ
  - text 12,2.7 blue center: "C1: capacitor b11 b13 100n"
  - text 3,3.4 blue center: 09 電解コンデンサ
  - text 3,4.7 blue center: "C2: ecap d2 d4 100u"
  - text 6,3.4 blue center: 10 バリキャップ
  - text 6,4.7 blue center: "D4: varicap d5 d7 33p"
  - text 9,3.4 blue center: 11 コイル
  - text 9,4.7 blue center: "L1: inductor d8 d10 10m"
  - text 12,3.4 blue center: 12 CdS セル
  - text 12,4.7 blue center: "R3: photoresistor d11 d13"
  - text 3,5.4 blue center: 13 サーミスタ
  - text 3,6.7 blue center: "R4: thermistor f2 f4 10k"
  - text 6,5.4 blue center: 14 NTC サーミスタ
  - text 6,6.7 blue center: "R5: thermistor-ntc f5 f7 10k"
  - text 9,5.4 blue center: 15 PTC サーミスタ
  - text 9,6.7 blue center: "R6: thermistor-ptc f8 f10"
  - text 12,5.4 blue center: 16 バリスタ
  - text 12,6.7 blue center: "R7: varistor f11 f13 470V"
  - text 3,7.4 blue center: 17 水晶振動子
  - text 3,8.7 blue center: "X1: crystal h2 h4 16M"
  - text 6,7.4 blue center: 18 ダイオード
  - text 6,8.7 blue center: "D1: diode h5 h7 1N4148"
  - text 9,7.4 blue center: 19 LED
  - text 9,8.7 blue center: "D2: led h8 h10"
  - text 12,7.4 blue center: 20 ツェナー
  - text 12,8.7 blue center: "D3: zener h11 h13 5V1"
  - text 3,9.4 blue center: 21 ショットキー
  - text 3,10.7 blue center: "D5: schottky j2 j4 1N5819"
  - text 6,9.4 blue center: 22 フォトダイオード
  - text 6,10.7 blue center: "D6: photodiode j5 j7"
  - text 9,9.4 blue center: 23 ダイアック
  - text 9,10.7 blue center: "D7: diac j8 j10"
  - text 12,9.4 blue center: 24 サイリスタ
  - text 12,10.7 blue center: "T1: thyristor j11 j13"
  - text 3,11.4 blue center: 25 トライアック
  - text 3,12.7 blue center: "T2: triac l2 l4"
  - text 6,11.4 blue center: 26 直流電源
  - text 6,12.7 blue center: "V1: vsource l5 l7 5"
  - text 9,11.4 blue center: 27 交流電源
  - text 9,12.7 blue center: "V2: sine l8 l10 1"
  - text 12,11.4 blue center: 28 方形波電源
  - text 12,12.7 blue center: "V3: square l11 l13 5"
  - text 3,13.4 blue center: 29 三角波電源
  - text 3,14.7 blue center: "V4: triangle n2 n4 1"
  - text 6,13.4 blue center: 30 定電流源
  - text 6,14.7 blue center: "I1: isource n5 n7 20m"
  - text 9,13.4 blue center: 31 電池
  - text 9,14.7 blue center: "B1: battery n8 n10 9"
  - text 12,13.4 blue center: 32 太陽電池
  - text 12,14.7 blue center: "PV1: solar n11 n13 0.6"
  - text 3,15.4 blue center: 33 スイッチ
  - text 3,16.7 blue center: "S1: switch p2 p4"
  - text 6,15.4 blue center: 34 b 接点スイッチ
  - text 6,16.7 blue center: "S2: switch-nc p5 p7"
  - text 9,15.4 blue center: 35 押しボタン
  - text 9,16.7 blue center: "S3: button p8 p10"
  - text 12,15.4 blue center: 36 b 接点ボタン
  - text 12,16.7 blue center: "S4: button-nc p11 p13"
  - text 3,17.4 blue center: 37 リードスイッチ
  - text 3,18.7 blue center: "S5: reed r2 r4"
  - text 6,17.4 blue center: 38 ヒューズ
  - text 6,18.7 blue center: "F1: fuse r5 r7 3A"
  - text 9,17.4 blue center: 39 ランプ
  - text 9,18.7 blue center: "P1: lamp r8 r10"
  - text 12,17.4 blue center: 40 スピーカー
  - text 12,18.7 blue center: "LS1: speaker r11 r13"
  - text 3,19.4 blue center: 41 マイク
  - text 3,20.7 blue center: "MK1: mic t2 t4"
  - text 6,19.4 blue center: 42 電流計
  - text 6,20.7 blue center: "A1: ammeter t5 t7"
  - text 9,19.4 blue center: 43 電圧計
  - text 9,20.7 blue center: "V5: voltmeter t8 t10"
  - text 12,19.4 blue center: 44 抵抗計
  - text 12,20.7 blue center: "M1: ohmmeter t11 t13"
  - text 3,21.4 blue center: 45 電力計
  - text 3,22.7 blue center: "W1: wattmeter v2 v4"
  - text 6,21.4 blue center: 46 検流計
  - text 6,22.7 blue center: "G1: galvanometer v5 v7"
  - text 9,21.4 blue center: 47 検出器
  - text 9,22.7 blue center: "D8: detector v8 v10"
style:
  grid: off
```

![図01 2 端子部品](out/02-parts-1.png)

値は種類から単位を補う (抵抗の `10k` → 10 kΩ、コイルの `10m` → 10 mH)。
ダイオードやスイッチのように値が型番や定格のものは、書いたとおりに出る。

`ecap` (電解コンデンサ) は先に書いた番地が + 側になる。上の `C2` なら b9 が +
(記号の平らな基板のほう。丸い基板が - 側)。

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
  IN:  port 3,2
  G1:  ground 6,2
  VCC: vcc 9,2
  VEE: vee 12,2
notes:
  - line 1.5,1.1 13.5,1.1 ink
  - line 1.5,3.1 13.5,3.1 ink
  - line 1.5,1.1 1.5,3.1 ink
  - line 4.5,1.1 4.5,3.1 ink
  - line 7.5,1.1 7.5,3.1 ink
  - line 10.5,1.1 10.5,3.1 ink
  - line 13.5,1.1 13.5,3.1 ink
  - text 3,1.4 blue center: 01 端子
  - text 3,2.7 blue center: "IN: port b3"
  - text 6,1.4 blue center: 02 グラウンド
  - text 6,2.7 blue center: "G1: ground b6"
  - text 9,1.4 blue center: 03 電源レール (+)
  - text 9,2.7 blue center: "VCC: vcc b9"
  - text 12,1.4 blue center: 04 電源レール (-)
  - text 12,2.7 blue center: "VEE: vee b12"
style:
  grid: off
```

![図02 1 端子の記号](out/02-parts-2.png)

グラウンドは離して描いても同じ節点になるが、**電源レールはならない**
(5V と 3V3 を同じネットにしてしまうため)。つなぐなら配線を引く。

## モータ

`motor` は**丸に M** の 2 端子。計器と同じ「丸に字」の記号で描く (circuitikz 1.0 の
モータの記号は使えないため)。下は MOSFET でモータを回す回路で、モータの両端に
**還流ダイオード** (D1) を逆向きに入れて、切った瞬間の逆起電力を逃がす。

```circuit
title: 図03 モータを MOSFET で回す
parts:
  B1: battery 1,1 1,5 5
  M1: motor 5,1 5,3
  D1: diode 7,3 7,1 1N4001
  Q1: nmos-e 5,4
  R1: resistor 2,4 4,4 100
  PWM: port 2,4
  G1: ground 5,5
wires:
  - 1,1 -- 5,1 -- 7,1
  - 5,3 -- 7,3
  - 5,3 -- Q1.D
  - Q1.S -- 5,5
  - 4,4 |- Q1.G
  - 1,5 -- 5,5
style:
  grid: on
```

![図03 モータを MOSFET で回す](out/02-parts-3.png)

モータは基板 (breadboard / perfboard) に挿さず線でつなぐので、実体配線図では
`type: device` の機器として書く。

## 可変コンデンサ

`capacitor-var` は極板 2 枚を斜めの矢が貫く記号 (ポリバリコン・トリマ)。矢は
**どう置いても右上を向く**。下はラジオの入口の同調回路で、コイル (L1) と
可変コンデンサ (VC1) を並列にして、回した容量で受ける周波数を選ぶ。
バリキャップ (`varicap`) は可変容量ダイオードで、記号も物も別。

```circuit
title: 図04 コイルと可変コンデンサの同調回路
parts:
  ANT: port 1,1
  L1: inductor 3,1 3,3 330u
  VC1: capacitor-var 5,1 5,3 l=$\mathrm{VC}_1$
  OUT: port 8,1
  G1: ground 5,3
wires:
  - 1,1 -- 8,1
  - 3,3 -- 5,3
style:
  grid: on
```

![図04 コイルと可変コンデンサの同調回路](out/02-parts-4.png)

値は書いていない。ポリバリコンの容量は 1 つの値ではなく可変の範囲
(20〜260 pF など) なので、本文や表に書く。ID の `VC1` は先頭 1 文字が本体・
残りが添字の決まりで V の添字 C1 に組まれ、電圧に見える。`l=` で字を差し替える。

可変コンデンサも基板に挿さず線でつなぐので、実体配線図では `type: device` の
機器として書く。

## アンテナとイヤホン

`antenna` は棒の上に逆三角の 1 端子の記号。`port` と同じく **ID が記号の横に出て、
乗っているネットの名前にもなる**。上に立つのが記号の意味なので、向きは書けない。
`earphone` はイヤホンで、circuitikz にイヤホンの記号が無いので、ブザーと同じく
スピーカーの記号を借りている。下はゲルマラジオで、アンテナで受けた電波を
L1 と VC1 の同調回路で選び、D1 で検波してイヤホンで聞く。

```circuit
title: 図05 アンテナからイヤホンまでのゲルマラジオ
parts:
  ANT: antenna 1,1
  L1: inductor 3,1 3,3 330u
  VC1: capacitor-var 5,1 5,3 l=$\mathrm{VC}_1$
  D1: diode 7,1 9,1 1N60
  C1: capacitor 11,1 11,3 1n
  R1: resistor 13,1 13,3 100k
  EAR: earphone 15,1 15,3 l=$\mathrm{EAR}$
  G1: ground 3,3
  G2: ground 5,3
  G3: ground 11,3
  G4: ground 13,3
  G5: ground 15,3
wires:
  - 1,1 -- 7,1
  - 9,1 -- 15,1
style:
  grid: on
```

![図05 アンテナからイヤホンまでのゲルマラジオ](out/02-parts-5.png)

イヤホンの ID `EAR` は、先頭 1 文字が本体・残りが添字の決まりで E の添字 AR に
組まれる。`l=` で字を差し替える。クリスタルイヤホンの容量 (約 15 nF) や
インピーダンスは値に書かず、本文や表に書く。

アンテナもイヤホンも基板に挿さず線でつなぐので、実体配線図では `type: device` の
機器として書く。

## デュアルゲート MOSFET

`nmos-dg` は 3SK291 のような**ゲートが 2 本ある FET** (N チャネル)。丸の中にチャネルの棒と
ゲートの基板 2 枚を描いた記号で、ピンは `G1` (信号を入れる。左下) `G2` (バイアスや AGC。左上)
`D` (上) `S` (下)。どちらのゲートかは形では読めないので、図に `G1` `G2` の名前が出る。
型番は記号の下。`G` だけでは G1 か G2 か分からないので、書くと断られる。D と S は番地の列に
乗るので `--` で、ゲートは行から少しずれているので `-|` で引く。
下は高周波の 1 段増幅の書き方の例で、アンテナの信号を C1 で G1 に入れ、G2 には R3・R4 で
分けた固定の電圧をかける。

```circuit
title: 図06 デュアルゲート MOSFET の高周波 1 段増幅
parts:
  ANT: antenna 1,5
  C1: capacitor 2,5 4,5 100p
  R1: resistor 4,3 4,5 100k
  R2: resistor 4,5 4,8 33k
  R3: resistor 6,1 6,3 10k
  R4: resistor 6,3 8,3 47k
  Q1: nmos-dg 10,5 3SK291
  R5: resistor 10,1 10,3 330
  R6: resistor 10,7 10,9 100
  C2: capacitor 10,3 12,3 10n
  OUT: port 13,3
  VCC: vcc 4,3
  VCC: vcc 6,1
  VCC: vcc 10,1
  GA: ground 4,8
  GB: ground 8,3
  GC: ground 10,9
wires:
  - 1,5 -- 2,5
  - 4,5 -| Q1.G1
  - Q1.G2 -| 6,3
  - 10,3 -- Q1.D
  - 10,7 -- Q1.S
  - 12,3 -- 13,3
style:
  grid: on
```

![図06 デュアルゲート MOSFET の高周波 1 段増幅](out/02-parts-6.png)

値はピンのつなぎ方を見せるための例で、動作点は確かめていない。G1 は 0 V ではほぼ流れないので、
実際には R1・R2 のような分圧で正のバイアスをかける。電源の `VCC` は同じ名前を何度書いても
同じ節点になる。実物は面実装なので、実体配線図では変換基板に載せた姿 (`dip4` / `sip4` に型番 `3SK291`) で描く。

## セラミックフィルタ

`ceramic-filter` (略記 `cfilter`) は 455 kHz の中間周波などに使う**セラミックフィルタ**。
三端子レギュレータと同じ箱で描き、ピンは `IN` (左) `GND` (下) `OUT` (右)。
信号が左から右へ流れ、アースが下へ落ちるので、フィルタを信号の線の途中に置ける。
下はフィルタの特性を測る回路で、前後の抵抗が計器とフィルタの入出力の間を合わせる。
基板に載せるときは `sip3` に型番 `SFU455B` を添える (橙の胴で描かれ、ピンは `IN` `GND` `OUT`)。

```circuit
title: 図07 セラミックフィルタの測定回路
parts:
  IN: port 1,5
  R1: resistor 2,5 4,5 1k
  CF1: ceramic-filter 6,5 SFU455B
  R2: resistor 9,7 9,9 1k
  OUT: port 11,5
  GA: ground 6,7
  GB: ground 9,9
wires:
  - 1,5 -- 2,5
  - 4,5 -- CF1.IN
  - CF1.GND -- 6,7
  - CF1.OUT -- 9,5
  - 9,5 -- 9,7
  - 9,5 -- 11,5
style:
  grid: on
```

![図07 セラミックフィルタの測定回路](out/02-parts-7.png)

抵抗の 1 kΩ は例の値で、実物の入出力インピーダンスに合わせて選ぶ (SFU455 の値は確かめていない)。
