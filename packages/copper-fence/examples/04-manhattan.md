# Manhattan の島

銅の板 (表が地) に小さな島を作り、足のある部品を島から島へ渡す (本の 3-11)。
実物は島を切り出すか、別の板の小片 (MeSQUARES) を接着する。**作り方は描き分けない**
— 図にあるのは出来上がりの銅。

```copper
board:
  size: 40x30mm
  ground: front
title: 図01 π 型アッテネータ (Manhattan)
copper:
  S1: pad 2.5,10 5x2
  S2: pad 37.5,10 5x2
  P1: pad 10,10 4x4
  P2: pad 30,10 4x4
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

- SMA の中心導体は**縁まで伸びた島** (S1・S2) に載せる。縁に地が残っていると中心導体が地に触れる
- 部品の端に**点**を書くと、そこは表の地 (島にも溝にも無い所) になる
- `wires:` は島どうしのジャンパ
