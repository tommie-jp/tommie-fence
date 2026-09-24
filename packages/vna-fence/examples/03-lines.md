# 伝送線路とスタブ、TDR

`line Z0 長さ vf 速度係数` は損失の無い線路。**縦続の順に書く**。
並列 (`shunt`) の線路はスタブで、先を `open` か `short` にする。

```vna
sweep: 1M-300M 301
title: 図01 144 MHz の λ/4 開放スタブ (ノッチ)
dut:
  - shunt line 50 34.4cm vf 0.66 open
traces:
  - S21 logmag
  - S11 smith
markers:
  - 144M
notes:
  - band 140M 148M: 2m バンド
```

![図01 144 MHz の λ/4 開放スタブ (ノッチ)](out/03-lines-1.svg)

- λ/4 = 0.66 × 299.8 / 144 / 4 = 34.4 cm。開放の先が入口では短絡に見え、
  144 MHz を落とす

ケーブルの先を開放して TDR を見ると、**先端までの距離**に山が立つ。

```vna
sweep: 1M-900M 401
title: 図02 先を開放した 2 m のケーブル
dut:
  - line 50 2m vf 0.66
  - open
traces:
  - S11 tdr vf 0.66
  - S11 logmag
  - S11 phase
markers:
  - 100M
```

![図02 先を開放した 2 m のケーブル](out/03-lines-2.svg)

- TDR は**帯域通過のインパルス応答**。山の位置が反射の場所で、開放か短絡かの
  見分けは出ない (低域通過のステップは持たない)
- 横に見える範囲は 1 / (点の間隔) で決まる (図の下の 1 行)。**TDR には等間隔の
  掃引が要る**
