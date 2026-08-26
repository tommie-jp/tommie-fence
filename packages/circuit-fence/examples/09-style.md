# 色と大きさ

テーマの色は 1 つずつ上書きできる。`ink-color` が線と文字、`paper-color` が
端子の白丸など地の色で塗るところ、`grid-color` がグリッドの点。

色は `#rgb` か `#rrggbb` だけを受ける。名前 (`red` など) は通さない
(検証済みの値しか図に入れないため)。

```circuit
parts:
  IN:  port a1
  R1:  resistor a1 a3 10k
  C1:  capacitor a3 c3 100n
  OUT: port a4
  G1:  ground c3
wires:
  - a3 -- a4
style:
  ink-color: '#14532d'
  paper-color: '#f0fdf4'
  grid-color: '#86efac'
  grid: on
```

`pitch` は 1 マスの大きさ (cm、0.5〜5)、`wire-width` は線の太さ (pt、0.2〜4)。
詰めて太くすると、小さく貼っても読める。

```circuit
parts:
  IN:  port a1
  R1:  resistor a1 a3 10k
  C1:  capacitor a3 c3 100n
  OUT: port a4
  G1:  ground c3
wires:
  - a3 -- a4
style:
  grid: on
  pitch: 1.2
  wire-width: 1.6
```

`standard` は記号の流儀。既定の `american` は抵抗がギザギザ。

```circuit
parts:
  R1: resistor a1 a3 10k
  L1: inductor a5 a7 10m
style:
  grid: on
  standard: american
```

`european` にすると抵抗が箱になる (IEC の流儀)。

```circuit
parts:
  R1: resistor a1 a3 10k
  L1: inductor a5 a7 10m
style:
  grid: on
  standard: european
```

`width` は出力の横ドット数 (120〜4000)。図の中身は動かさず、外寸だけ変える。
資料の段幅に合わせたいときに使う。

```circuit
parts:
  IN:  port a1
  R1:  resistor a1 a3 10k
  C1:  capacitor a3 c3 100n
  OUT: port a4
  G1:  ground c3
wires:
  - a3 -- a4
style:
  grid: on
  width: 320
```
