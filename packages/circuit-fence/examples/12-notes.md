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
  - circle R1
  - text d1 blue: "R1: resistor a1 a3 10k"
  - text e1: ここでカットオフ 159 Hz
style:
  grid: on
```

印は `- circle 指し先 [色]` の 1 行。指し先は**部品 ID か番地**で、
部品を指すと記号の真ん中に、番地を指すとその交点に丸が出る。

字は `- text 番地 [色]: 文字` と書く。番地が字の**左端**になる。
字は YAML の値なので、`:` を含むときは `"…"` で囲む。

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
  - circle D1 orange
  - text a6: LED の順方向電圧は 2 V ぐらい
  - text b6: 電流は (9 - 2) / 470 で 15 mA
```
