# 使える部品

2 端子部品は `ID: 種類 番地 番地 [値]` の 1 行で書く。

```circuit
parts:
  R1: resistor a1 a3 10k
  C1: capacitor a5 a7 100n
  C2: ecap a9 a11 100u
  L1: inductor a13 a15 10m
  D1: diode c1 c3 1N4148
  D2: led c5 c7
  D3: zener c9 c11 5V1
  V1: vsource e1 e3 5
  V2: sine e5 e7 1
  I1: isource e9 e11 20m
  B1: battery g1 g3 9
  S1: switch g5 g7
  F1: fuse g9 g11 3A
  P1: lamp i1 i3
style:
  grid: on
```

値は種類から単位を補う (抵抗の `10k` → 10 kΩ、コイルの `10m` → 10 mH)。
ダイオードやスイッチのように値が型番や定格のものは、書いたとおりに出る。

`ecap` (電解コンデンサ) は先に書いた番地が + 側になる。上の `C2` なら a9 が +
(記号の平らな板のほう。丸い板が - 側)。
