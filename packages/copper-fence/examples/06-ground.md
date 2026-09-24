# 地の加工 — via・切り欠き・パッチ

`via` は島を裏の地へ落とす (実物は穴に線を通して両面を半田付け)。
`slot` は地の切り欠き。**裏ベタの板では裏の物なので破線**で描く。

```copper
board: 50x50mm
title: 図01 2.4GHz のパッチアンテナ
f: 2.4G
copper:
  PATCH: pad 25,20 29x29
  FEED: line 25,34.5 25,50 3.06
parts:
  J1: sma bottom 25
notes:
  - dim 10.5,3 39.5,3
```

![図01 2.4GHz のパッチアンテナ](out/06-ground-1.svg)

表が地の板では、`slot` は溝として描く。**地に打った via** (どの島にも触れない via) は
溝を掘らず、表の地と裏の地をつなぐ (via の列で線路の両脇の地を留める)。

```copper
board:
  size: 40x20mm
  ground: both
  cut: 0.3
title: 図02 CPWG と via の列
copper:
  L1: line 0,10 40,10 1.6
  X1: slot 20,3 20x1
  V1: via 8,7.5
  V2: via 20,7.5
  V3: via 32,7.5
  V4: via 8,12.5
  V5: via 20,12.5
  V6: via 32,12.5
parts:
  J1: sma left 10
  J2: sma right 10
notes:
  - text 21,5: 切り欠き
```

![図02 CPWG と via の列](out/06-ground-2.svg)
