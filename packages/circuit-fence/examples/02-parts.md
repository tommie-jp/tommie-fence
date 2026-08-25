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

## そのほかの 2 端子部品

センサ・スイッチ・波形の違う電源・計器。書き方は同じ 1 行。

```circuit
parts:
  R2:  resistor-var a1 a3 10k
  D4:  varicap a5 a7 33p
  X1:  crystal a9 a11 16M
  R3:  photoresistor a13 a15
  R4:  thermistor c1 c3 10k
  R5:  varistor c5 c7 470V
  D5:  schottky c9 c11 1N5819
  D6:  photodiode c13 c15
  D7:  diac e1 e3
  V3:  square e5 e7 5
  V4:  triangle e9 e11 1
  PV1: solar e13 e15 0.6
  S2:  switch-nc g1 g3
  S3:  button g5 g7
  S4:  button-nc g9 g11
  S5:  reed g13 g15
  LS1: speaker i1 i3
  MK1: mic i5 i7
  A1:  ammeter i9 i11
  V5:  voltmeter i13 i15
style:
  grid: on
```

`switch` / `button` は a 接点 (ふだん開いている)、`-nc` が付くほうは b 接点。
水晶の値は周波数なので、`16M` と書くと 16 MHz になる。

入っていない記号が 2 つある。抵抗計 (`ohmmeter`) は記号の中の Ω に
フォントが要り、フェンスの TeX では**例外ではなくプロセスごと落ちる**。
NTC / PTC サーミスタは落ちないが、記号の中の θ が `#` で出る。
どちらも代わりが無いので、サーミスタは区別の無い `thermistor` だけにしてある。

## 1 端子の記号

`port` (端子) と `ground` のほかに、電源レールの `vcc` / `vee` がある。
どちらも **ID がそのまま図に出て、乗っているネットの名前にもなる**。

```circuit
parts:
  VCC: vcc a1
  R1:  resistor a1 c1 1k
  D1:  led c1 e1
  G1:  ground e1
  IN:  port a4
  R2:  resistor a4 c4 10k
  VEE: vee c4
style:
  grid: on
```

グラウンドは離して描いても同じ節点になるが、**電源レールはならない**
(5V と 3V3 を同じネットにしてしまうため)。つなぐなら配線を引く。
