# クリッパとクランパ — 方形波を加工する

回路 1-9 の題。±5 V の方形波をダイオードで加工する。ダイオードの順電圧は 0.7 V とみる。

クリッパ: 2 本のダイオードで ±0.7 V に頭を打つ (`clip -0.7V 0.7V`)。

クリッパは 1 kΩ の後ろにダイオードを逆向きに 2 本並べて地へ落とす。

```circuit
title: 回路図01 クリッパ
parts:
  W1: square 1,2 1,5 l=$\mathrm{W1}$
  G1: ground 1,5
  R1: resistor 3,2 6,2 1k
  D1: diode 7,2 7,5
  D2: diode 8,5 8,2
  G2: ground 8,5
  OUT: port 10,2
wires:
  - 1,2 -- 3,2
  - 6,2 -- 7,2
  - 7,2 -- 8,2
  - 7,5 -- 8,5
  - 8,2 -- 10,2
```

<img src="out/schematic/02-clipper-1.png" alt="回路図01 クリッパ" width="725">

```scope
title: 図01 クリッパの入出力
time: 200us/div
trigger: ch1 rising
ch1: square 1kHz 5V
ch2: ch1 | clip -0.7V 0.7V
measure: [vmax, vmin]
```

![図01 クリッパの入出力](out/02-clipper-1.svg)

クランパ: C とダイオードで下の端を −0.7 V に揃える (`offset 4.3V`)。
CH2 は −0.7〜9.3 V。0 V の基準が違うので、ch ごとの V/div と ▶ の位置を見て読む。

クランパはコンデンサを直列に入れ、出力と地の間にダイオードを 1 本つなぐ。

```circuit
title: 回路図02 クランパ
parts:
  W1: square 1,2 1,5 l=$\mathrm{W1}$
  G1: ground 1,5
  C1: capacitor 3,2 6,2 1u
  D1: diode 7,5 7,2
  G2: ground 7,5
  OUT: port 9,2
wires:
  - 1,2 -- 3,2
  - 6,2 -- 7,2
  - 7,2 -- 9,2
```

<img src="out/schematic/02-clipper-2.png" alt="回路図02 クランパ" width="649">

```scope
title: 図02 クランパの入出力
time: 200us/div
trigger: ch1 rising
ch1: square 1kHz 5V
ch2: ch1 | offset 4.3V
measure: [vmax, vmin]
```

![図02 クランパの入出力](out/02-clipper-2.svg)
