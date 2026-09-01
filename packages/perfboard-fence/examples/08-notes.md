# 注釈と見た目

## 注釈 (`notes:`)

図に印を付けて、文章から指せるようにするためのもの。**回路の一員ではない** —
ネットにもネットリストにも出ないので、印を足しても配線は変わらない。

```perfboard
board: 14x8
title: 図01 印を付ける
points:
  IN: a1
  GND: h1
parts:
  R1: resistor c3 c7 10k
  C1: capacitor/ceramic e7 e10 100n
wires:
  - IN -- c3
  - c7 -- e7
  - e10 -- GND
notes:
  - mark c3 red
  - box b6 f11 blue
  - arrow g4 c5
  - text g6 ここから電源
```

![図01 印を付ける](out/08-notes-1.svg)

| 印 | 書き方 | 出るもの |
| --- | --- | --- |
| `mark` | `mark 番地 [色]` | 穴を囲む丸 |
| `box` | `box 番地 番地 [色]` | 2 つの番地を対角にした枠 |
| `arrow` | `arrow 番地 番地 [色]` | 1 つ目から 2 つ目への指し棒 |
| `text` | `text 番地 言葉` | その穴のそばに出る字 |

**`text` には色を書けない。** 字は残り全部を言葉として取るので、色を許すと
「色の名前で始まる注釈」が黙って色になる。区別の付かない書き方は作らない。

## 見た目 (`style:`)

テーマの名前 1 つだけなら、そのまま書ける。

```perfboard
board: 14x8
style: dark
title: 図02 暗いテーマ
points:
  IN: a1
  GND: h1
parts:
  R1: resistor c3 c7 10k
  D1: led c9 c11 green
wires:
  - IN -- c3
  - c7 -- c9
  - c11 -- GND
```

![図02 暗いテーマ](out/08-notes-2.svg)

白黒で刷る資料には `mono` を選ぶ。**色で意味を持たせない**ので、
コピーしても読めるものだけが残る。

```perfboard
board: 14x8
style:
  theme: mono
  width: 640
title: 図03 白黒で刷る
points:
  IN: a1
  GND: h1
parts:
  R1: resistor c3 c7 10k
  D1: led c9 c11 green
wires:
  - IN -- c3
  - c7 -- c9
  - c11 -- GND
```

![図03 白黒で刷る](out/08-notes-3.svg)

**配色だけがテーマで動く。** 穴も字も寸法は 3 つとも同じなので、同じフェンスを
別のテーマで出しても部品の位置も線の通り道も動かない (図02 と図03 は色だけが違う)。

`width` は書き出す画の大きさだけを変える。`debug: off` でお知らせを伏せられるが、
**読めなかった行はこの切り替えの対象ではない** — 伏せると「無かったこと」に化ける。
