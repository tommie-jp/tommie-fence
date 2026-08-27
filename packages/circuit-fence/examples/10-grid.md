# グリッドを見ながら置く

`style: grid: on` にすると、部品を置ける位置が点で出る。
行は左に英字、列は上に数字で、ブレッドボードと同じ読み方。

```circuit
title: 図01 グリッド
parts:
  IN:  port a1
  R1:  resistor a1 a2 10k
  C1:  capacitor a2 b2 100n
  OUT: port a3
  G1:  ground b2
wires:
  - a2 -- a3
notes:
  - source a4 blue
style:
  grid: on
  grid-to: c4
```

`grid-to` を書くと、使っていない範囲までグリッドが伸びる。
部品を動かす先が見えるので、番地を書き換えながら組むときに使う。
