# 図に注釈を重ねる

`notes:` に書いたものは図の上に重なる。**回路の一員ではない**ので、
ネットリストにも分岐の黒丸にも数えない。

```circuit
title: 図01 注釈
parts:
  IN:  port 1,1
  R1:  resistor 1,1 2,1 10k
  C1:  capacitor 2,1 2,2 100n
  OUT: port 3,1
  G1:  ground 2,2
wires:
  - 2,1 -- 3,1
notes:
  - source 4,1 blue
  - circle R1
  - text 1,3: ここでカットオフ 159 Hz
style:
  grid: on
```

![図01 注釈](out/12-notes-1.png)

印は `- circle 指し先 [色]` の 1 行。指し先は**部品 ID か番地**で、
部品を指すと記号の真ん中に、番地を指すとその交点に丸が出る。

字は `- text 番地 [色]: 文字` と書く。番地が字の**左端**になる。
字は YAML の値なので、`:` を含むときは `"…"` で囲む。

`- source 番地 [色]` は、**そのフェンスの中身をそのまま図に並べる**。
上の図の右がそれで、囲みの ``` も付く。プレビューではフェンスが図に
差し替わって書いた YAML が見えなくなるので、図と並べて読めるようにしておく。
中身はフェンス自身から作るので、図を直すと書き出しも動く。

**行番号は添えない**。そのまま書き写せる形であることが値打ちなので、
書いていない字は混ぜない。

## 色

書ける色は 4 つ。明るいテーマでも暗いテーマでも読める値にしてある。
印は書かなければ赤、字は書かなければ図のほかの文字と同じ色。

```circuit
title: 図02 注釈の色
parts:
  R1: resistor 1,1 3,1
  R2: resistor 4,1 6,1
  R3: resistor 1,3 3,3
  R4: resistor 4,3 6,3
notes:
  - circle R1 red
  - circle R2 blue
  - circle R3 green
  - circle R4 orange
  - text 2,1.7 red center: red
  - text 5,1.7 blue center: blue
  - text 1,2 blue: "R1: resistor a1 a3"
  - text 4,2 blue: "R2: resistor a4 a6"
  - text 2,3.7 green center: green
  - text 5,3.7 orange center: orange
  - text 1,4 blue: "R3: resistor c1 c3"
  - text 4,4 blue: "R4: resistor c4 c6"
style:
  grid: on
```

![図02 注釈の色](out/12-notes-2.png)

## 日本語

**注釈の字はプレビューでも日本語が出る**。部品の値とは違って、フェンスの
TeX には字を渡さず、描き上がった図に差し込んでいるため。

```circuit
title: 図03 日本語
parts:
  V1: battery 1,1 1,2 9
  R1: resistor 1,1 3,1 470
  D1: led 3,1 3,2
  G1: ground 1,2
wires:
  - 1,2 -- 3,2
notes:
  - source 5,1 blue
  - circle D1 orange
  - text 1,3: LED の順方向電圧は 2 V ぐらい
  - text 1,4: 電流は (9 - 2) / 470 で 15 mA
style:
  grid: on
```

![図03 日本語](out/12-notes-3.png)

## 字の大きさ

`- text 番地 大きさ: 文字` と書くと、字の大きさを 5 段から選べる。
書かなければ普通の大きさ。

```circuit
title: 図04 字の大きさ
parts:
  R1: resistor 1,1 2,1 10k
notes:
  - text 1,2 tiny: tiny (極小)
  - text 1,3 small: small (小)
  - text 1,4: 書かなければ普通
  - text 1,5 large: large (大)
  - text 1,6 huge: huge (極大)
  - source 3,1 blue
style:
  grid: on
  grid-to: 2,6
```

![図04 字の大きさ](out/12-notes-4.png)

pt の直接指定は書けない。色と同じで、**実機に通した指定だけ**を名前で引く
(プレビューの TeX はフォントが無いと例外ではなくプロセスごと落ちる)。

## 寄せと太字

`left` / `center` / `right` で、番地を字のどこにするかを決める。
書かなければ `left` で、番地が字の左端になる。`bold` は太字。

```circuit
title: 図05 寄せと太字
parts:
  R1: resistor 1,1 2,1 10k
notes:
  - circle 2,2
  - text 2,2 left: left (番地が左端)
  - circle 2,3
  - text 2,3 center: center (番地が真ん中)
  - circle 2,4
  - text 2,4 right: right (番地が右端)
  - text 2,5 bold: bold で太字になる
  - source 5,1 blue
style:
  grid: on
  grid-to: 3,5
```

![図05 寄せと太字](out/12-notes-5.png)

色・大きさ・寄せ・太字は**どの順に書いてもよい**。
`- text b1 bold blue huge: …` も `- text b1 huge bold blue: …` も同じ。

## 枠 (`box`) と指し棒 (`arrow`)

`- box 番地 番地 [色]` は 2 つの番地を対角にした枠を引く。
`- arrow 起点 終点 [色]` は指し棒で、両端とも**部品 ID か番地**。

```circuit
title: 図06 枠と指し棒
parts:
  IN:  port 1,1
  R1:  resistor 1,1 2,1 10k
  C1:  capacitor 2,1 2,2 100n
  OUT: port 3,1
  G1:  ground 2,2
wires:
  - 2,1 -- 3,1
notes:
  - box 1,1 3,3 blue
  - text 2,4 blue center: box a1 c3 blue
  - arrow 4,2 R1
  - text 4,2 red: R1のコメント
  - source 7,1 blue
style:
  grid: on
  grid-to: 6,3
```

![図06 枠と指し棒](out/12-notes-6.png)

部品を指した指し棒は、印 (`circle`) と同じ丸の縁で止まる。
真ん中まで伸ばすと、先端が記号の下に隠れて何を指しているか分からなくなるため。

## 直線 (`line`) と実線の枠

`- line 起点 終点 [色]` は指し棒と同じ書き方で、**先端の矢が付かない**。
表の罫線や区切りのように、向きを持たない線を引くためのもの。
枠は `solid` を書くと破線ではなく実線になる。

```circuit
title: 図07 直線と実線の枠
parts:
  R1: resistor 2,2 4,2 10k
  R2: resistor 2,4 4,4 4.7k
notes:
  - box 1,1 5,5 ink solid
  - line 1,1 5,1 ink
  - line 1,3 5,3 ink
  - line 1,5 5,5 ink
  - text 1,2.5 blue left: line で仕切る
  - text 1,6 blue: box a1 e5 ink solid
  - source 8,1 blue
style:
  grid: on
```

![図07 直線と実線の枠](out/12-notes-7.png)

枠 (`box`) は角の番地の外へ余白を取るので、隣り合う枠は近づけると重なる。
**線には余白が無い**ので、細かく仕切りたいときはこちらを使う
(文法リファレンスの部品一覧の表は、この線で 1 部品 1 マスに区切ってある)。

## 書き出しの行送り

`- source` にだけ、行送りを選ぶ `tight` / `loose` が書ける。
書かなければその中間 (既定)。長いフェンスを図の高さに収めたいときは `tight`、
1 行ずつ指しながら説明したいときは `loose`。

```circuit
title: 図08 行送り
parts:
  R1: resistor 1,1 2,1 10k
notes:
  - text 3,1 blue bold: tight
  - source 3,2 tight
  - text 10,1 blue bold: loose
  - source 10,2 loose
style:
  pitch: 1
```

![図08 行送り](out/12-notes-8.png)

`tight` でも字の高さは下回らない。それより詰めると、上の行の下がりと
下の行の上がりが噛む。
