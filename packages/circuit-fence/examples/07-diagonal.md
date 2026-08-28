# 斜めに置く

部品も配線も**斜めに置いてよい**。行も列も揃っていない 2 点の間に、そのまま引く。

```circuit
title: 図01 斜めに置く
parts:
  IN:  port a1
  R1:  resistor a1 b3
  R2:  resistor b3 a5
  OUT: port a5
wires:
  - a1 -- a5
notes:
  - source a6 blue
style:
  grid: on
```

![図01 斜めに置く](out/07-diagonal.png)

`R1` は `a1` から `b3` へ、`R2` は `b3` から `a5` へ斜めに寝る。
配線の `--` も 2 点の間をまっすぐ引くので、斜めのまま通る。

通らないのは両端が同じ番地のときだけ (向きも長さも決まらないため)。
そのときは行番号つきで返る。
