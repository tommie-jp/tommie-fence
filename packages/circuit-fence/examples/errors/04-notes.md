# 注釈の直し方

`notes:` でよくつまずくのは、字の `:` を引用符なしで書いたとき。
YAML は `:` のあとに空白が続くとマップの区切りとして読むので、
**エラーにならずマップになってしまう**。
yaml 自身の言い分は英語で「Nested mappings are not allowed」だけなので、
直し方を添えて返す。

**この例もわざと壊してある。**

写しの先頭に付けた数字は、分かりやすくするために添えた行番号。
**ソースに行番号はない**。

```circuit
parts:
  R1: resistor a1 a3 10k
notes:
  - text b1: R1: resistor a1 a3 10k
```

書いたのはこれ。

```text
15 parts:
16   R1: resistor a1 a3 10k
17 notes:
18   - text b1: R1: resistor a1 a3 10k
```

帯にはこう出る。

```text
circuit: 18 行目: YAML の構文エラー: Nested mappings are not allowed in compact mappings (`:` を含む文字は "…" で囲みます)
```

字は YAML の値なので、`"R1: resistor a1 a3 10k"` と囲めば通る。

## 指し先と色と字

印の指し先は部品 ID か番地。どちらでもない名前は行番号つきで返る。
色はパレットの 4 つだけ。字に使えない字も、使える字を添えて返す。

```circuit
parts:
  R1: resistor a1 a3 10k
notes:
  - circle Rload
  - circle R1 rainbow
  - text b1: gain = 10
```

書いたのはこれ。

```text
44 parts:
45   R1: resistor a1 a3 10k
46 notes:
47   - circle Rload
48   - circle R1 rainbow
49   - text b1: gain = 10
```

帯にはこう出る。

```text
circuit: 48 行目: 注釈の色 rainbow は知りません (red / blue / green / orange が使えます)
circuit: 49 行目: 注釈の文字に使えない文字があります (英数字と . + - / ( ) _ % : 、日本語、µ Ω ° が使えます)
circuit: 47 行目: 注釈の指す先 Rload がありません (部品 ID か番地で書きます)
```

読めた注釈は描き、読めなかった 1 つだけを落とす。行番号が前後しているのは、
読む段階ごとにまとめて出しているため (1 行ずつ読む → 図に組む、の順)。
`=` が通らないのは値と同じ理由で、**注釈から任意の TeX を作らせない**ため。

## 字の見た目と、印に書けない言葉

字に添える言葉は色・大きさ・寄せ・太字の 4 種類。知らない言葉は書ける言葉を
添えて返る。同じ種類を 2 回書いたときも、**後に書いたほうが黙って勝たない**。

印・枠・指し棒には字が無いので、字にだけ効く言葉を書くと、そう書いて返る。
指し棒の起点と終点が同じところだと向きが決まらないので、これも返る。

```circuit
parts:
  R1: resistor a1 a3 10k
notes:
  - text b1 enormous: ここ
  - text b2 tiny huge: ここ
  - circle R1 huge
  - arrow R1 R1
```

書いたのはこれ。

```text
84 parts:
85   R1: resistor a1 a3 10k
86 notes:
87   - text b1 enormous: ここ
88   - text b2 tiny huge: ここ
89   - circle R1 huge
90   - arrow R1 R1
```

帯にはこう出る。

```text
circuit: 87 行目: 注釈の言葉 enormous は知りません (色: red / blue / green / orange、大きさ: tiny / small / normal / large / huge、寄せ: left / center / right、太字: bold が使えます)
circuit: 88 行目: 注釈の大きさが二重に書かれています (tiny と huge)
circuit: 89 行目: circle は 「- circle 部品IDか番地 [色]」 で書きます (huge は字の注釈にだけ書けます)
circuit: 90 行目: 指し棒の起点と終点が同じところです (R1)
```

読めた注釈は描き、読めなかったものだけを落とすのは印のときと同じ。
