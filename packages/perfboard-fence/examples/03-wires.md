# 配線とネットリスト

`wires:` に `- 穴 -- 穴` と書く。**2 つの穴をまっすぐ結ぶ。**
ブレッドボードのような経路探索は無い — 溝もレールも無く、どの穴も同じ格子の
上にあり、実物のジャンパも 2 点を最短で結ぶ。

```perfboard
board: 12x7
title: 図01 配線
points:
  VCC: a1
  GND: g1
parts:
  R1: resistor b3 b6 1k
  D1: led b9 b11 red
wires:
  - VCC -- b3 red
  - b6 -- b9 orange
  - b11 -- GND black
```

![図01 配線](out/03-wires-1.svg)

色は後ろに書ける。書かなければ灰色。**知らない色は書式エラー**にして受け取らない
(色は属性へ流れるので、持っている名前だけを通す)。

**全穴が独立している。** 部品を挿しただけでは何にもつながらず、ネットリストは
書いた配線からだけ出る。上の図のネットリストはこうなる。

```text
VCC : R1.1
N1  : R1.2, D1.1
GND : D1.2
```

ブレッドボードは列の 5 穴が最初から導通しているので、同じ列に挿すだけで
1 つのネットになる。**ここが物理の違いで、設計の分かれ目**。

斜めにも引ける。

```perfboard
board: 10x8
title: 図02 斜めの配線
points:
  VCC: a1
  GND: h1
parts:
  R1: resistor b3 b6 10k
wires:
  - VCC -- b3 red
  - b6 -- h10 blue
  - h10 -- GND black
```

![図02 斜めの配線](out/03-wires-2.svg)
