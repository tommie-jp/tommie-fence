# お知らせ (読めてはいるが、思ったとおりに出ない)

**読めなかった行**と、**読めてはいるが思ったとおりには出ないところ**は分けて扱う。
後者を「お知らせ」と呼び、`style: debug: off` で伏せられる。
**読めなかった行は伏せられない** (黙って消えるほうが困る)。

## 黙って捨てられていたもの

```breadboard
parts:
  AD2:
    type: device
    at: top
    label: Analog Discovery 2
    value: 波形発生器
    pins: [W1, GND]
  R1:
    type: resistor
    at: bottom
    holes: [a5, a10]
wires:
  - AD2.W1 -- a5 yellow
```

機器の箱に出るのは `label` だけ、板に挿す部品の位置を決めるのは `holes` だけ。
**受理はするが図に出ない指定**は、そのままだと書いた人に何も伝わらない。

```text
breadboard: 2 行目: 部品 AD2: 機器 (device) に value は使いません。箱に出す名前は label に書きます
      AD2:
breadboard: 8 行目: 部品 R1: at は機器 (device) にだけ使います。板に挿す部品の位置は holes で決まります
      R1:
```

行番号がマップの頭 (`AD2:`) を指しているのは、指定そのものではなく
**その部品**の話だから。1 つの部品に複数の指定が並ぶので、部品の行に集める。

部品そのものは今までどおり描く。落とすのはその指定だけ。

## YAML に食われる書き方

```breadboard
style:
  text-color: #333
  text-size: 99
parts:
  R1: resistor a5 a10 330
```

- `#` から始まる値は **YAML のコメント**になり、値が空で届く。
  書いた本人には書いたとおりに見えるので、囲み方まで添えて言う。
- 範囲を外れた数値は捨てずに端へ寄せる (書いた意図は残るほうがよい)。
  寄せたことはお知らせに出す。

```text
breadboard: 2 行目: style の text-color は色として読めません (#rgb か #rrggbb で書きます) (`#` から始まる値は "…" で囲みます。囲まないと YAML のコメントになります)
      text-color: #333
breadboard: 3 行目: style の text-size は 6〜24 です (24 にしました)
      text-size: 99
```

`text-color` のほうは**読めなかった行**なので、`debug: off` でも出る。
`text-size` のほうはお知らせなので伏せられる。

## 注釈の指し先が両取りになるとき

```breadboard
parts:
  a5: resistor c5 c10 330
notes:
  - circle a5
```

`a5` は部品 ID にも穴番地にも読める。**部品 ID を先に探す**規則なので図は
部品を囲むが、書いた人がどちらのつもりだったかは分からない。お知らせで添える。

```text
breadboard: 4 行目: 注釈の a5 は部品を指しています (穴 a5 ではありません)
      - circle a5
               ^^
```
