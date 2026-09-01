# 部品を置く

`parts:` に `名前: 種類 穴 穴 値` と書く。部品は**2 つの穴を結ぶ線の上に寝る**。

```perfboard
board: 12x7
title: 図01 2 本足の部品
points:
  IN: a1
  OUT: a12
parts:
  R1: resistor b2 b6 10k
  C1: capacitor b8 b11 100n
  D1: led d2 d4 green
  L1: inductor d6 d10 100u
wires:
  - IN -- b2
  - b6 -- b8
  - b11 -- OUT
  - b6 -- d2
  - d4 -- d6
  - d10 -- OUT
```

![図01 2 本足の部品](out/02-parts-1.svg)

抵抗は**値が抵抗として読めればカラーコードを塗る**。`10k` は茶・黒・橙。
読めない値のときは帯を描かない — 実物と違う帯は、図を信じた人を間違えさせる。

LED は書かれた色で光る。知らない色でも既定の赤で描く (足の位置は変わらない)。

```perfboard
board: 14x5
title: 図02 抵抗の値と LED の色
points:
  IN: a1
  OUT: a14
parts:
  R1: resistor b2 b5 220
  R2: resistor b7 b10 4k7
  D1: led d2 d4 blue
  D2: led d6 d8 yellow
wires:
  - IN -- b2
  - b5 -- b7
  - b10 -- OUT
  - IN -- d2
  - d4 -- d6
  - d8 -- OUT
```

![図02 抵抗の値と LED の色](out/02-parts-2.svg)

斜めにも置ける。胴は 2 穴を結ぶ線の傾きのまま寝る。

```perfboard
board: 8x8
title: 図03 斜めに置く
points:
  IN: a1
  OUT: h8
parts:
  R1: resistor b2 e5 1k
wires:
  - IN -- b2
  - e5 -- OUT
```

![図03 斜めに置く](out/02-parts-3.svg)

置ける種類は 2 本足だけ。3 本足・DIP・SIP は「知らない」ではなく
**「まだ置けません」**と言う。
