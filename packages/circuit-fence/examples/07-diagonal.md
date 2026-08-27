# 斜めに置く

部品も配線も**斜めに置いてよい**。行も列も揃っていない 2 点の間に、そのまま引く。

```circuit
title: 斜めに置く
parts:
  IN:  port a1
  R1:  resistor a1 c4
  R2:  resistor c4 a7
  OUT: port a7
wires:
  - a1 -- a7
notes:
  - source a8 blue
style:
  grid: on
```

`R1` は `a1` から `c4` へ、`R2` は `c4` から `a7` へ斜めに寝る。
配線の `--` も 2 点の間をまっすぐ引くので、斜めのまま通る。

通らないのは両端が同じ番地のときだけ (向きも長さも決まらないため)。
そのときは行番号つきで返る。
