# 部品の周波数特性 — 寄生分のある模型

部品は理想の値のほかに**寄生分**を持てる。`esr` と `esl` は直列に、`cp` は全体に
並列に付く。**1 端子にして (最後に `short`) |Z| を見る**と、自己共振 (SRF) が谷になる。

DUT の等価回路 — `series C 1000p esr 0.1 esl 1.2n` を開いたもの。ESL と ESR は C に直列に付き、最後の `short` で地へ落とす。

```circuit
title: 回路図01 1000 pF と寄生分 (ESL・ESR)
parts:
  J1: sma b2 mirror
  C1: capacitor b3 b5 1000p
  LS: inductor b5 b7 1.2n l=$\mathrm{ESL}$
  RS: resistor b7 b9 0.1 l=$\mathrm{ESR}$
  G1: ground c2
  G2: ground c10
wires:
  - J1.1 -- b3
  - b9 -- b10 -- c10
  - J1.2 -- c2
notes:
  - text a2 center: CH0
```

<img src="out/schematic/02-parts-1.png" alt="回路図01 1000 pF と寄生分 (ESL・ESR)" width="634">

```vna
sweep: 1M-1G 401
title: 図01 セラミックコンデンサ 1000 pF の SRF
dut:
  - series C 1000p esr 0.1 esl 1.2n
  - short
traces:
  - S11 z
  - S11 smith
markers:
  - 145M
  - 500M
notes:
  - text 145M 0.5Ω: SRF (ここより上ではコイル)
```

![図01 セラミックコンデンサ 1000 pF の SRF](out/02-parts-1.svg)

- 1 / (2π √(1.2 nH × 1000 pF)) = 145 MHz で |Z| が ESR (0.1 Ω) まで落ちる
- |Z| だけの枠は**対数** (10 倍ごと)。R や X を混ぜると線形になる

コイルの**並列**の共振 (巻線の間の容量 `cp`) は山になる。R と X を重ねる。

DUT の等価回路 — `cp` は L と ESR を合わせた全体に並列に付く。

```circuit
title: 回路図02 1 uH と巻線の容量
parts:
  J1: sma b2 mirror
  L1: inductor b4 b6 1u
  RS: resistor b6 b8 0.5 l=$\mathrm{ESR}$
  CP: capacitor d5 d7 1.5p l=$C_\mathrm{p}$
  G1: ground c2
  G2: ground c10
wires:
  - J1.1 -- b3 -- b4
  - b8 -- b9 -- b10
  - b3 |- d5
  - d7 -| b9
  - b10 -- c10
  - J1.2 -- c2
notes:
  - text a2 center: CH0
```

<img src="out/schematic/02-parts-2.png" alt="回路図02 1 uH と巻線の容量" width="632">

```vna
sweep: 1M-300M 301
title: 図02 1 µH のコイルと巻線の容量 1.5 pF
dut:
  - series L 1u esr 0.5 cp 1.5p
  - short
traces:
  - S11 r
  - S11 x
markers:
  - 50M
  - 130M
```

![図02 1 µH のコイルと巻線の容量 1.5 pF](out/02-parts-2.svg)

水晶は C (小さい) + L (大きい) + R に並列の C (電極)。`esl` と `cp` で書ける。

DUT の等価回路 — `series C 20f esl 12.665m esr 20 cp 5p` を開いたもの。直列の C・L・R に電極の容量 Cp が並列に付き、CH0 と CH1 の間に入る。

```circuit
title: 回路図03 水晶の等価回路
parts:
  J1: sma b2 mirror
  C1: capacitor b4 b6 20fF
  L1: inductor b6 b8 12.665m
  R1: resistor b8 b10 20
  CP: capacitor d6 d8 5p l=$C_\mathrm{p}$
  J2: sma b12
  G1: ground c2
  G2: ground c12
wires:
  - J1.1 -- b3 -- b4
  - b10 -- b11 -- J2.1
  - b3 |- d6
  - d8 -| b11
  - J1.2 -- c2
  - J2.2 -- c12
notes:
  - text a2 center: CH0
  - text a12 center: CH1
```

<img src="out/schematic/02-parts-3.png" alt="回路図03 水晶の等価回路" width="788">

```vna
sweep: 9.99M-10.03M 401
title: 図03 10 MHz の水晶 — 直列共振と並列共振
dut:
  - series C 20f esl 12.665m esr 20 cp 5p
traces:
  - S21 logmag
  - S21 phase
markers:
  - 10M
  - 10.02M
```

![図03 10 MHz の水晶 — 直列共振と並列共振](out/02-parts-3.svg)
