# 読めなかったときに何が出るか

図が 1 枚も組めないときはカードが、組めたが一部が読めなかったときは帯が出る。
どちらも**行番号と、その行の中身と、綴りを指す印**が付く。

`board:` が無いと板の大きさが決まらないので、何も描けない。

```perfboard
parts:
  R1: resistor b3 b7
```

種類の綴りが違うとき。**似た名前を並べて返す。**

```perfboard
board: 10x6
parts:
  R1: resistr b3 b7
```

まだ置けない種類は「知らない」ではなく**「まだ置けません」**と言う。
綴りを疑うべきものと、待つべきものとでは次にやることが違う。

```perfboard
board: 10x6
parts:
  Q1: transistor b3 b5 b7
```

板の外を指したとき。**行が足りないのか列が足りないのか**を言い分ける。

```perfboard
board: 10x6
parts:
  R1: resistor b3 b99
```

1 つの穴に挿せる足は 1 本。

```perfboard
board: 10x6
parts:
  R1: resistor b3 b7
  R2: resistor b7 b9
```

配線の色は持っている名前だけを通す。

```perfboard
board: 10x6
parts:
  R1: resistor b3 b7
wires:
  - b3 -- b7 chartreuse
```
