# 色と大きさ

テーマの色は 1 つずつ上書きできる。`ink-color` が線と文字、`paper-color` が
端子の白丸など地の色で塗るところ、`grid-color` がグリッドの点。

色は `#rgb` か `#rrggbb` だけを受ける。名前 (`red` など) は通さない
(検証済みの値しか図に入れないため)。

```circuit
title: 色の上書き
parts:
  IN:  port a1
  R1:  resistor a1 a2 10k
  C1:  capacitor a2 b2 100n
  OUT: port a3
  G1:  ground b2
wires:
  - a2 -- a3
notes:
  - source a4 blue
style:
  ink-color: '#14532d'
  paper-color: '#f0fdf4'
  grid-color: '#86efac'
  grid: on
```

`pitch` は 1 マスの大きさ (cm、0.5〜5)、`wire-width` は線の太さ (pt、0.2〜4)。
詰めて太くすると、小さく貼っても読める。

```circuit
title: pitch と wire-width
parts:
  IN:  port a1
  R1:  resistor a1 a2 10k
  C1:  capacitor a2 b2 100n
  OUT: port a3
  G1:  ground b2
wires:
  - a2 -- a3
notes:
  - source a4 blue
style:
  grid: on
  pitch: 1.2
  wire-width: 1.6
```

`standard` は記号の流儀。既定の `american` は抵抗がギザギザ。

```circuit
title: 記号の流儀 american
parts:
  R1: resistor a1 a3 10k
  L1: inductor a5 a7 10m
notes:
  - source a8 blue
style:
  grid: on
  standard: american
```

`european` にすると抵抗が箱になる (IEC の流儀)。

```circuit
title: 記号の流儀 european
parts:
  R1: resistor a1 a3 10k
  L1: inductor a5 a7 10m
notes:
  - source a8 blue
style:
  grid: on
  standard: european
```

`width` は出力の横ドット数 (120〜4000)。図の中身は動かさず、外寸だけ変える。
資料の段幅に合わせたいときに使う。

```circuit
title: 出力の横幅
parts:
  IN:  port a1
  R1:  resistor a1 a2 10k
  C1:  capacitor a2 b2 100n
  OUT: port a3
  G1:  ground b2
wires:
  - a2 -- a3
notes:
  - source a4 blue
style:
  grid: on
  width: 320
```

`stamp: on` は、その図を組んだ処理系の版を右下に刻む。**字は書かない** —
処理系が埋めるので、拡張機能を更新すれば刻印も一緒に新しくなる。
資料に貼った図が、どの版で描いたものかを後から辿れる。

```circuit
title: 版の刻印
parts:
  IN:  port a1
  R1:  resistor a1 a2 10k
  C1:  capacitor a2 b2 100n
  OUT: port a3
  G1:  ground b2
wires:
  - a2 -- a3
notes:
  - source a4 blue
style:
  grid: on
  stamp: on
```

刻まないときも、版は書き出した `.svg` の根に `data-circuit-fence` として
必ず入っている (図の見た目は変わらない)。
