# 図に注釈を重ねる

`notes:` に書いたものは図の上に重なる。**回路の一員ではない**ので、
ネットリストにも分岐の黒丸にも数えない。

```circuit
parts:
  IN:  port a1
  R1:  resistor a1 a3 10k
  C1:  capacitor a3 c3 100n
  OUT: port a4
  G1:  ground c3
wires:
  - a3 -- a4
notes:
  - source a6 blue
  - circle R1
  - text e1: ここでカットオフ 159 Hz
style:
  grid: on
```

印は `- circle 指し先 [色]` の 1 行。指し先は**部品 ID か番地**で、
部品を指すと記号の真ん中に、番地を指すとその交点に丸が出る。

字は `- text 番地 [色]: 文字` と書く。番地が字の**左端**になる。
字は YAML の値なので、`:` を含むときは `"…"` で囲む。

`- source 番地 [色]` は、**そのフェンスの中身をそのまま図に並べる**。
上の図の右がそれで、囲みの ``` も付く。プレビューではフェンスが図に
差し替わって書いた YAML が見えなくなるので、図と並べて読めるようにしておく。
中身はフェンス自身から作るので、図を直すと書き出しも動く。

先頭の数字は、分かりやすくするために添えた **Markdown の行番号**。
図の下の帯に出る「13 行目」をそのまま探せる。**ソースに行番号はない**。

## 色

書ける色は 4 つ。明るいテーマでも暗いテーマでも読める値にしてある。
印は書かなければ赤、字は書かなければ図のほかの文字と同じ色。

```circuit
parts:
  R1: resistor a1 a3
  R2: resistor a5 a7
  R3: resistor a9 a11
  R4: resistor a13 a15
notes:
  - circle R1 red
  - circle R2 blue
  - circle R3 green
  - circle R4 orange
  - text b1 red: red
  - text b5 blue: blue
  - text b9 green: green
  - text b13 orange: orange
  - text c1 blue: "R1: resistor a1 a3"
  - text c5 blue: "R2: resistor a5 a7"
  - text c9 blue: "R3: resistor a9 a11"
  - text c13 blue: "R4: resistor a13 a15"
style:
  grid: on
```

## 日本語

**注釈の字はプレビューでも日本語が出る**。部品の値とは違って、フェンスの
TeX には字を渡さず、描き上がった図に差し込んでいるため。

```circuit
parts:
  V1: battery a1 c1 9
  R1: resistor a1 a4 470
  D1: led a4 c4
  G1: ground c1
wires:
  - c1 -- c4
notes:
  - source a6 blue
  - circle D1 orange
  - text a6: LED の順方向電圧は 2 V ぐらい
  - text b6: 電流は (9 - 2) / 470 で 15 mA
style:
  grid: on
```

## 字の大きさ

`- text 番地 大きさ: 文字` と書くと、字の大きさを 5 段から選べる。
書かなければ普通の大きさ。

```circuit
parts:
  R1: resistor a1 a3 10k
notes:
  - text b1 tiny: tiny (極小)
  - text c1 small: small (小)
  - text d1: 書かなければ普通
  - text e1 large: large (大)
  - text f1 huge: huge (極大)
  - source a6 blue
style:
  grid: on
  grid-to: f4
```

pt の直接指定は書けない。色と同じで、**実機に通した指定だけ**を名前で引く
(プレビューの TeX はフォントが無いと例外ではなくプロセスごと落ちる)。

## 寄せと太字

`left` / `center` / `right` で、番地を字のどこにするかを決める。
書かなければ `left` で、番地が字の左端になる。`bold` は太字。

```circuit
parts:
  R1: resistor a1 a5 10k
notes:
  - circle c3
  - text c3 left: left (番地が左端)
  - circle e3
  - text e3 center: center (番地が真ん中)
  - circle g3
  - text g3 right: right (番地が右端)
  - text i3 bold: bold で太字になる
  - source a8 blue
style:
  grid: on
  grid-to: i6
```

色・大きさ・寄せ・太字は**どの順に書いてもよい**。
`- text b1 bold blue huge: …` も `- text b1 huge bold blue: …` も同じ。

## 枠 (`box`) と指し棒 (`arrow`)

`- box 番地 番地 [色]` は 2 つの番地を対角にした枠を引く。
`- arrow 起点 終点 [色]` は指し棒で、両端とも**部品 ID か番地**。

```circuit
parts:
  IN:  port a1
  R1:  resistor a1 a3 10k
  C1:  capacitor a3 c3 100n
  OUT: port a4
  G1:  ground c3
wires:
  - a3 -- a4
notes:
  - box a1 c3 blue
  - text a6 blue: box a1 c3 blue
  - arrow c6 R1
  - text c7 red: arrow c6 R1
  - source a10 blue
style:
  grid: on
  grid-to: c8
```

部品を指した指し棒は、印 (`circle`) と同じ丸の縁で止まる。
真ん中まで伸ばすと、先端が記号の下に隠れて何を指しているか分からなくなるため。
