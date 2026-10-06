# Manhattan の島

銅の基板 (表が地) に小さな島を作り、ピンのある部品を島から島へ渡す (本の 3-11)。
実物は島を切り出すか、別の基板の小片 (MeSQUARES) を接着する。**作り方は描き分けない**
— 図にあるのは出来上がりの銅。

```copper
board:
  size: 40x30mm
  ground: front
title: 図01 π 型アッテネータ (Manhattan)
copper:
  S1: pad 2.5,10 5x2mm
  S2: pad 37.5,10 5x2mm
  P1: pad 10,10 4x4mm
  P2: pad 30,10 4x4mm
parts:
  J1: sma left 10
  J2: sma right 10
  R1: resistor P1 P2 18
  R2: resistor P1 10,22 300
  R3: resistor P2 30,22 300
wires:
  - S1 -- P1
  - P2 -- S2
```

![図01 π 型アッテネータ (Manhattan)](out/04-manhattan.svg)

等価回路 (π 型アッテネータの等価回路) — 線路は伝送線路 (`tline`、値は Z0)、SMA の外皮は地。

```circuit
title: 回路図01 パイ型アッテネータの等価回路
parts:
  J1: sma 2,2 mirror
  R1: resistor 5,2 9,2 18
  R2: resistor 5,4 5,6 300
  R3: resistor 9,4 9,6 300
  J2: sma 12,2
  G1: ground 2,3
  G2: ground 12,3
  G3: ground 5,7
  G4: ground 9,7
wires:
  - J1.1 -- 5,2
  - 5,2 -- 5,4
  - 9,2 -- J2.1
  - 9,2 -- 9,4
  - 5,6 -- 5,7
  - 9,6 -- 9,7
  - J1.2 -- 2,3
  - J2.2 -- 12,3
```

![回路図01 パイ型アッテネータの等価回路](out/schematic/04-manhattan.png)

π 型のアッテネータ。島 S1・P1 が左の節点、P2・S2 が右の節点、表の地が GND。周波数が低いうちは線路の長さを無視できる。

- SMA の中心導体は**縁まで伸びた島** (S1・S2) に載せる。縁に地が残っていると中心導体が地に触れる
- 部品の端に**点**を書くと、そこは表の地 (島にも溝にも無い所) になる
- `wires:` は島どうしのジャンパ
