# 非反転アンプ

多端子部品は 1 つの番地に置き、足は `U1.out` `Q1.B` のように名前で指す。

```circuit
title: 図01 非反転アンプ
parts:
  IN:  port b1
  C1:  capacitor b1 b2 1u
  Rb:  resistor b2 d2 100k
  G1:  ground d2
  U1:  opamp b4 +up
  R2:  resistor c3 d3 1k
  G2:  ground d3
  R3:  resistor c3 c5 10k
  OUT: port b6
wires:
  - b2 |- U1.+
  - c3 |- U1.-
  - U1.out -- b5 -- b6
  - c5 -- b5
notes:
  - source a7 blue
style:
  grid: on
```

![図01 非反転アンプ](out/04-non-inverting-amp.png)

オペアンプは `+up` で + を上にしている。帰還を下に回せるので線が交差しない。

**足へは `-|` か `|-` で引く**。足は記号ごとに決まった位置にあって格子の上に
無いので、`--` (まっすぐ) で番地とつなぐと斜めの線になる。`|-` なら先に縦、
それから横に入るので、回路図らしく直角に入る。

帰還の節点は記号の真下ではなく**少し横にずらす** (`c4` ではなく `c3`)。
真下に置くと、足へ向かう線が記号の体を突き抜けて見える。

出口は `U1.out -- b5 -- b6` と 1 行につないである。b5 は帰還を当てる節点で、
そこを通る経路として読める。2 行に分けて書いても同じ図になる。
