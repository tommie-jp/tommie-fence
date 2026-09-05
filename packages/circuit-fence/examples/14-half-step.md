# 交点の間に置く

交点と交点の間に置きたいときは、番地の後ろに**「行の英字 + 列の数字」の組**を足す
(`a1a5` は列が 1 と 2 の間、`a1f0` は行が a と b の間)。**英字が行のずれ、
数字が列のずれ**で、英字は `a` = 0 の 10 段 (`f` が半分)。2 組で 1/100 まで。

`a1.5` のような小数は通さない。`.` は足の区切りでもあるので (`U1.5` は DIP の
5 番ピン)、番地から `.` を外して**「`.` があれば足」**と分かれるようにしてある。

```circuit
title: 図01 交点の間に節点を置く
parts:
  IN:  port a1
  R1:  resistor a1 a2a5 10k
  C1:  capacitor a2a5 c2a5 100n
  G1:  ground c2a5
  OUT: port a4
wires:
  - a2a5 -- a4
notes:
  - source a5 blue
style:
  grid: on
```

![図01 交点の間に節点を置く](out/14-half-step-1.png)

抵抗の右端を `a2` と `a3` の間に置いた。**他の番地を振り直さずに**節点を
ずらせるのが、間を書ける理由。グリッドの点は**交点の上にだけ**打つので、
間に置いた部品は点と点の間に乗る。

```circuit
title: 図02 並んだ枝の間に 1 本足す
parts:
  IN:  port a1
  R1:  resistor a1 a5 1k
  R2:  resistor b1 b5 2k
  R3:  resistor b1f0 b5f0 3k
  R4:  resistor c1 c5 4k
  OUT: port a5
wires:
  - a1 -- b1 -- c1
  - a5 -- b5 -- c5
notes:
  - source a6 blue
style:
  grid: on
  pitch: 3
```

![図02 並んだ枝の間に 1 本足す](out/14-half-step-2.png)

`R3` だけが行 b と c の**間**にいる。後から 1 本足したくなっても、
**`R4` から下を振り直さずに済む**のがここでの効き目。左右の縦線の途中に
乗るので、つなぎ方はほかの枝と変わらない (ネットリストでも同じ節点に入る)。

**間隔が詰まると記号も詰まる**。この図が `pitch: 3` を書いているのはそのため —
既定の 2cm のままだと、半マス (1cm) しか離れていない `R2` と `R3` で、
値の字と ID の字が重なる。狭いと感じたら、番地ではなくマスのほうを広げる。

## どちらへずれるか

組の**英字が下へ、数字が右へ**動かす。同じ `.5` でも、書く場所で向きが変わる。

```circuit
title: 図03 英字は下へ、数字は右へ
parts:
  P1: port a1
  P2: port a3a5
  P3: port a6f0
  P4: port a9f5
notes:
  - text b1 blue center: a1
  - text b3 blue center: a3a5 (右へ .5)
  - text b6 blue center: a6f0 (下へ .5)
  - text b9 blue center: a9f5 (両方 .5)
  - source a11 blue
style:
  grid: on
  pitch: 3
```

![図03 英字は下へ、数字は右へ](out/14-half-step-3.png)

`a1a5` は `a1` の右、`a1f0` は下、`a1f5` はその両方。**組の中の並びは
番地そのものと同じ (行 → 列)** なので、覚えるものは増えない。
