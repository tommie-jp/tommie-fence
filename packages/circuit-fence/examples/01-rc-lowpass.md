# RC ローパス

抵抗とコンデンサ 1 つずつの一次ローパスフィルタ。番地で置く場所を書くだけで、
座標も `\coordinate` も書かない。

```circuit
title: 回路図01 RC ローパス
parts:
  IN:  port a1
  R1:  resistor a1 a3 10k
  C1:  capacitor a3 c3 100n
  OUT: port a4
  G1:  ground c3
wires:
  - a3 -- a4
notes:
  - source a5 blue
style:
  grid: on
```

番地は行が英字 (`a` から下へ)、列が数字 (`1` から右へ)。
`a1` と `a3` は同じ行なので、`R1` は横に寝る。`a3` と `c3` は同じ列なので
`C1` は縦に立つ。

ネットリストは図から機械的に導ける。`IN` と `OUT` はポートの名前がそのまま
ネットの名前になり、グラウンドは離して描いても同じ節点として数える。

| ネット | つながっている端子 |
| --- | --- |
| IN | IN, R1.1 |
| OUT | R1.2, C1.1, OUT |
| GND | C1.2, G1 |
