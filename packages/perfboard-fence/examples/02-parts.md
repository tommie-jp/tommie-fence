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
  - IN -- a2
  - a2 -- b2
  - b6 -- b8
  - b11 -- b12
  - b12 -- OUT
  - b6 -- c6
  - c6 -- c2
  - c2 -- d2
  - d4 -- d6
  - d10 -- d12
  - d12 -- OUT
notes:
  - source blue
```

![図01 2 本足の部品](out/02-parts-1.svg)

抵抗は**値が抵抗として読めればカラーコードを塗る**。`10k` は茶・黒・橙に、
許容差の茶 (±1%) が付いた 4 帯。**帯の本数は値の桁数で決まる** — 3 桁要る値
(`4k99`) は 5 帯になり、温度係数を書くと 6 帯 (`10k 1% 50ppm`)。
許容差を書かなければ ±1% (金属皮膜の標準)、`10k 5%` と書けば金の帯になる。
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
  - IN -- a2
  - a2 -- b2
  - b5 -- b7
  - b10 -- b14
  - b14 -- OUT
  - IN -- a2
  - a2 -- d2
  - d4 -- d6
  - d8 -- d14
  - d14 -- OUT
notes:
  - source blue
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
  - IN -- a2
  - a2 -- b2
  - e5 -- h5
  - h5 -- OUT
notes:
  - source blue
```

![図03 斜めに置く](out/02-parts-3.svg)

## 同軸コネクタ (SMA)

`sma` は**中心導体と GND の 2 本足**で書く。実物の GND は 4 本だが、図と
ネットリストで意味を持つのは「どこが中心でどこが GND か」の 2 つ。
姿に `male` / `female` を書くと、**中心がピンか穴かで描き分ける** — 図を見て
挿す人が、合う相手を取り違えないように。

```perfboard
board: 14x8
title: 図04 SMA コネクタ (オスとメス)
points:
  GND: h1
parts:
  J1: sma/female c3 c5
  J2: sma/male c10 c12
  R1: resistor e5 e10 50
wires:
  - c3 -- e3
  - e3 -- e5
  - c5 -- c1
  - c1 -- GND
  - e10 -- c10
  - c12 -- c1
  - c1 -- GND
```

![図04 SMA コネクタ (オスとメス)](out/02-parts-4.svg)

**胴は足を広げても伸びない。** 六角の胴 (6.35mm) を持つ金物なので、玉の部品
(LED) と同じ扱いで、大きさは足の間隔で変わらない。**穴 2 つに載る形ではない**ので、
当たり判定は胴の大きさで見る (隣に部品を置くと重なりとして言われる)。

`-edge` を付けると**横置き** (端面実装)。板の縁に載せて、首から先を板の外へ出す。
図は実物の外形図と同じ 3 段 — 左から**ねじ部** (1/4-36UNS の筋)、**ねじなし**、
**台座**。**台座の右端が板の縁**に来る (実物もそこで板を挟む。台座の厚さは 1mm)。
そこから先は**凹の形**で、**上下にアース**が伸び、その間から**中心導体が凸に**
出て、先の穴に入る。

```perfboard
board:
  size: 16x8
  slots: on
style:
  back: on
title: 図05 SMA を板の縁に載せる (横置き)
points:
  GND: h1
parts:
  J1: sma/female-edge c1 c0
  J2: sma/male-edge f1 f0
  R1: resistor c6 c10 50
wires:
  - c1 -- c6
  - c10 -- f10
  - f10 -- f1
  - c0 -- c1
  - c1 -- GND
  - f0 -- f1
  - f1 -- GND
```

![図05 SMA を板の縁に載せる (横置き)](out/02-parts-5.svg)

**張り出すのは GND の側。** 実物は GND の脚が板の縁に来て、中心導体がその内側まで
伸びるので、**中心導体を先に、板の縁側の GND をあとに**書く。

上の図の GND は **`c0`** — 板の外の番地で、**縁の銅箔 (スロット) の位置**にあたる。
銅箔は穴の格子のちょうど 1 つ外に並んでいるので、`0` 列がそのままその銅箔になる。
つまり**脚を銅箔に半田付けした**ことになり、ネットにもそう出る。

```text
N1  : J1.1, R1.1
N2  : R1.2, J2.1
GND : J1.2, J2.2
```

胴が板の外へ出るぶん、**画布のほうが広がる**。切って描くと、図を見た人は
切れたことに気づけない。

3 本足・DIP・SIP は [06-ic.md](06-ic.md)。まだ置けない種類 (`button` `device`)
は「知らない」ではなく**「まだ置けません」**と言う — 綴りを疑うべきものと、
待つべきものとでは次にやることが違う。
